import { Container, Graphics, Sprite } from "pixi.js";
import { Scene } from "../../../../shared/scene/Scene.js";
import { Camera } from "../../../../shared/render/Camera.js";
import { GameMap } from "../../../../shared/data/models/GameMap.js";
import { MapChunkRenderer } from "../../../../shared/render/MapChunkRenderer.js";
import { TileLayerDebugOverlay } from "../../../../client/render/TileLayerDebugOverlay.js";
import { ChunkDebugOverlay } from "../../../../client/render/ChunkDebugOverlay.js";
import { clampEditorCamera } from "../utils/clampEditorCamera.js";

export class SceneEditor extends Scene {
  constructor(state) {
    super();
    this.state = state;
    this.mapVisuals = null;
  }

  async enter(engine) {
    this.engine = engine;

    this.root = new Container();
    this.engine.renderer.stage.addChild(this.root);

    const viewport = this.engine.renderer.viewport;

    this.camera = new Camera(viewport);
    this.camera.freeMode = true;

    this.gridOverlay = new Graphics();
    this.root.addChild(this.gridOverlay);

    this.brushPreview = new Sprite();
    this.brushPreview.alpha = 0.5;
    this.brushPreview.visible = false;
    this.root.addChild(this.brushPreview);

    this.hoverOverlay = new Graphics();
    this.root.addChild(this.hoverOverlay);

    const initialMap =
      this.engine.runtimeMap ??
      (await GameMap.load("/content/maps/test_map.json"));

    this.setMap(initialMap, { resetCamera: true });
  }

  update(dt) {
    const s = this.state.get();
    const vp = this.engine.renderer.viewport;
    if (!this.map) return;

    // Clamp state camera with editor margins (half-viewport around map)
    const mapWidthPx = this.map.width * this.map.tileSize;
    const mapHeightPx = this.map.height * this.map.tileSize;
    clampEditorCamera(s.camera, mapWidthPx, mapHeightPx, vp);

    this.camera.x = Math.floor(s.camera.x);
    this.camera.y = Math.floor(s.camera.y);

    this.groundLayer.visible = !!s.visibleLayers.ground;
    this.groundDetailLayer.visible = !!s.visibleLayers.ground_detail;
    this.fringeLayer.visible = !!s.visibleLayers.fringe;

    this.collisionDebug.enabled = this.engine.debug.visible;
    this.chunkDebug.enabled = this.engine.debug.visible;

    const d = this.engine.debug;
    d.set("cam", `${Math.round(this.camera.x)}, ${Math.round(this.camera.y)}`);
    d.set("viewport", `${vp.tilesX}x${vp.tilesY} @${vp.scale}x`);
    d.set("canvas", `${vp.cssWidth}x${vp.cssHeight}`);
    d.set("mode", s.mode);
    d.set("tool", s.activeTool);
    d.set("layer", s.activeLayer);

    if (this.engine.debug.visible && this.chunkRenderer) {
      const ci = this.chunkRenderer.getDebugInfo();
      const chunkPx = this.map.chunkSize * this.map.tileSize;
      d.set("---chunks---", "");
      d.set("chunk size", `${this.map.chunkSize} tiles`);
      d.set("camera chunk", `${Math.floor(this.camera.x / chunkPx)},${Math.floor(this.camera.y / chunkPx)}`);
      d.set("visible chunks", ci.visibleChunkCount);
      d.set("views / chunks", `${ci.mountedViewCount}/${ci.visibleChunkCount}`);
      d.set(
        "entered",
        ci.enteredChunkCount > 0 ? ci.enteredChunkKeys.join(" ") : "",
      );
      d.set("exited", ci.exitedChunkCount > 0 ? ci.exitedChunkKeys.join(" ") : "");
      d.set("empty cached", ci.emptyKeyCount);
      if (ci.visibleChunkCount > 0) {
        const keys = ci.visibleChunkKeys.map(k => k.split(",").map(Number));
        const minX = Math.min(...keys.map(([x]) => x));
        const maxX = Math.max(...keys.map(([x]) => x));
        const minY = Math.min(...keys.map(([_, y]) => y));
        const maxY = Math.max(...keys.map(([_, y]) => y));
        d.set("chunk bounds", `${minX}-${maxX}, ${minY}-${maxY}`);
      }
    }
  }

  render(alpha) {
    if (!this.map) return;

    this.root.x = Math.floor(-this.camera.x);
    this.root.y = Math.floor(-this.camera.y);

    this.chunkRenderer.update(this.camera);
    this.collisionDebug.render(this.camera);
    this.chunkDebug.render(this.camera);
    this.renderGrid();
    this.updateBrushPreview();
    this.updateHoverOverlay();
  }

  renderGrid() {
    this.gridOverlay.clear();
    if (!this.state.get().showGrid) {
      this.gridOverlay.visible = false;
      return;
    }
    this.gridOverlay.visible = true;

    const ts = this.map.tileSize;
    const vp = this.engine.renderer.viewport;
    const viewW = vp.tilesX * ts;
    const viewH = vp.tilesY * ts;
    const mapW = this.map.width * ts;
    const mapH = this.map.height * ts;

    const startX = this.camera.x - ts;
    const startY = this.camera.y - ts;
    const endX = this.camera.x + viewW + ts;
    const endY = this.camera.y + viewH + ts;

    const y0 = Math.max(0, startY);
    const y1 = Math.min(mapH, endY);
    const x0 = Math.max(0, startX);
    const x1 = Math.min(mapW, endX);
    const drawH = y1 - y0;
    const drawW = x1 - x0;

    const firstCol = Math.floor(startX / ts);
    const lastCol = Math.ceil(endX / ts);
    const firstRow = Math.floor(startY / ts);
    const lastRow = Math.ceil(endY / ts);

    for (let col = firstCol; col <= lastCol; col++) {
      const x = col * ts;
      if (x < 0 || x >= mapW) continue;
      this.gridOverlay.rect(x, y0, 1, drawH);
    }
    for (let row = firstRow; row <= lastRow; row++) {
      const y = row * ts;
      if (y < 0 || y >= mapH) continue;
      this.gridOverlay.rect(x0, y, drawW, 1);
    }
    this.gridOverlay.fill({ color: 0xffffff, alpha: 0.12 });
  }

  updateBrushPreview() {
    const state = this.state.get();
    const hover = state.hoverTile;
    const brush = state.selectedBrush;

    if (
      !hover ||
      !brush ||
      brush.width !== 1 ||
      brush.height !== 1 ||
      brush.tiles[0] == null ||
      brush.tiles[0] < 0
    ) {
      this.brushPreview.visible = false;
      return;
    }

    const tileId = brush.tiles[0];
    const tex = this.chunkRenderer._getTileTexture(tileId);

    this.brushPreview.texture = tex;
    this.brushPreview.x = hover.x * this.map.tileSize;
    this.brushPreview.y = hover.y * this.map.tileSize;
    this.brushPreview.visible = true;
  }

  updateHoverOverlay() {
    this.hoverOverlay.clear();
    const hover = this.state.get().hoverTile;
    if (!hover || !this.map) return;

    const ts = this.map.tileSize;
    const x = hover.x * ts;
    const y = hover.y * ts;

    this.hoverOverlay.rect(x, y, ts, ts);
    this.hoverOverlay.fill({ color: 0xffffff, alpha: 0.08 });
  }

  rebuildChunk(cx, cy) {
    if (this.chunkRenderer) {
      this.chunkRenderer.rebuildChunk(cx, cy);
    }
  }

  exit() {
    this.engine.renderer.stage.removeChild(this.root);
  }

  setMap(map, { resetCamera = false } = {}) {
    // Current sync strategy is still a full refresh, but we build the new map
    // visuals first and only swap once the visible chunks are already populated.
    const prevVisuals = this.mapVisuals;
    const nextState = this.state.get();

    if (resetCamera) {
      this.state.update((s) => {
        s.camera.x = 0;
        s.camera.y = 0;
      });
    }

    this.map = map;
    this.camera.setBounds(this.map.width, this.map.height);
    this.camera.x = Math.floor(this.state.get().camera.x);
    this.camera.y = Math.floor(this.state.get().camera.y);

    const nextVisuals = this.buildMapVisuals(this.map);

    nextVisuals.groundLayer.visible = !!nextState.visibleLayers.ground;
    nextVisuals.groundDetailLayer.visible =
      !!nextState.visibleLayers.ground_detail;
    nextVisuals.fringeLayer.visible = !!nextState.visibleLayers.fringe;
    nextVisuals.collisionDebug.enabled = this.engine.debug.visible;
    nextVisuals.chunkDebug.enabled = this.engine.debug.visible;

    // Prewarm visible chunks before exposing the new container, so we never show
    // a frame with empty map layers during the full rebuild swap.
    nextVisuals.chunkRenderer.update(this.camera);

    this.root.addChildAt(nextVisuals.container, 0);
    this.mapVisuals = nextVisuals;
    this.applyMapVisuals(nextVisuals);

    if (prevVisuals) {
      this.root.removeChild(prevVisuals.container);
      this.destroyMapVisuals(prevVisuals);
    }

    this.state.update((s) => {
      s.map = this.map;
      s.dirtyChunks.clear();
    });
  }

  buildMapVisuals(map) {
    const container = new Container();
    const chunkRenderer = new MapChunkRenderer(
      map,
      this.engine.renderer.viewport,
      ["ground", "ground_detail", "fringe"],
    );

    const groundLayer = chunkRenderer.getLayerContainer("ground");
    const groundDetailLayer = chunkRenderer.getLayerContainer("ground_detail");
    const fringeLayer = chunkRenderer.getLayerContainer("fringe");

    const collisionDebug = new TileLayerDebugOverlay(
      map,
      this.engine.renderer.viewport,
      "collision",
      0xff0000,
    );
    const chunkDebug = new ChunkDebugOverlay(
      map,
      this.engine.renderer.viewport,
    );

    container.addChild(groundLayer);
    container.addChild(groundDetailLayer);
    container.addChild(fringeLayer);
    container.addChild(collisionDebug.container);
    container.addChild(chunkDebug.container);

    return {
      map,
      container,
      chunkRenderer,
      groundLayer,
      groundDetailLayer,
      fringeLayer,
      collisionDebug,
      chunkDebug,
    };
  }

  applyMapVisuals(visuals) {
    this.chunkRenderer = visuals.chunkRenderer;
    this.groundLayer = visuals.groundLayer;
    this.groundDetailLayer = visuals.groundDetailLayer;
    this.fringeLayer = visuals.fringeLayer;
    this.collisionDebug = visuals.collisionDebug;
    this.chunkDebug = visuals.chunkDebug;
  }

  destroyMapVisuals(visuals = this.mapVisuals) {
    if (!visuals) return;

    visuals.collisionDebug?.destroy();
    visuals.chunkDebug?.destroy();
    visuals.chunkRenderer?.destroy();

    if (visuals === this.mapVisuals) {
      this.mapVisuals = null;
      this.chunkRenderer = null;
      this.groundLayer = null;
      this.groundDetailLayer = null;
      this.fringeLayer = null;
      this.collisionDebug = null;
      this.chunkDebug = null;
    }
  }

  destroy() {
    this.destroyMapVisuals();
    this.gridOverlay?.destroy();
    this.brushPreview?.destroy();
    this.hoverOverlay?.destroy();
    this.root?.destroy({ children: true });
  }
}
