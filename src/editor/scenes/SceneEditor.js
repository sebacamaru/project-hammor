import { Container, Graphics, Sprite } from "pixi.js";
import { Scene } from "../../shared/scene/Scene.js";
import { Camera } from "../../shared/render/Camera.js";
import { GameMap } from "../../shared/data/models/GameMap.js";
import { MapChunkRenderer } from "../../shared/render/MapChunkRenderer.js";
import { TileLayerDebugOverlay } from "../../client/render/TileLayerDebugOverlay.js";
import { ChunkDebugOverlay } from "../../client/render/ChunkDebugOverlay.js";
import { clampEditorCamera } from "../utils/clampEditorCamera.js";

export class SceneEditor extends Scene {
  constructor(state) {
    super();
    this.state = state;
  }

  async enter(engine) {
    this.engine = engine;

    this.root = new Container();
    this.engine.renderer.stage.addChild(this.root);

    const viewport = this.engine.renderer.viewport;

    this.map = await GameMap.load("/content/maps/test_map.json");

    this.camera = new Camera(viewport);
    this.camera.setBounds(this.map.width, this.map.height);
    this.camera.freeMode = true;

    this.state.update((s) => {
      s.map = this.map;
      s.camera.x = 0;
      s.camera.y = 0;
    });

    this.chunkRenderer = new MapChunkRenderer(this.map, viewport, [
      "ground",
      "ground_detail",
      "fringe",
    ]);

    this.groundLayer = this.chunkRenderer.getLayerContainer("ground");
    this.groundDetailLayer =
      this.chunkRenderer.getLayerContainer("ground_detail");
    this.fringeLayer = this.chunkRenderer.getLayerContainer("fringe");

    this.root.addChild(this.groundLayer);
    this.root.addChild(this.groundDetailLayer);
    this.root.addChild(this.fringeLayer);

    this.collisionDebug = new TileLayerDebugOverlay(
      this.map,
      viewport,
      "collision",
      0xff0000,
    );
    this.root.addChild(this.collisionDebug.container);

    this.chunkDebug = new ChunkDebugOverlay(this.map, viewport);
    this.root.addChild(this.chunkDebug.container);

    this.gridOverlay = new Graphics();
    this.root.addChild(this.gridOverlay);

    this.brushPreview = new Sprite();
    this.brushPreview.alpha = 0.5;
    this.brushPreview.visible = false;
    this.root.addChild(this.brushPreview);

    this.hoverOverlay = new Graphics();
    this.root.addChild(this.hoverOverlay);
  }

  update(dt) {
    const s = this.state.get();
    const vp = this.engine.renderer.viewport;

    // Clamp state camera with editor margins (half-viewport around map)
    const mapWidthPx = this.map.width * this.map.tileSize;
    const mapHeightPx = this.map.height * this.map.tileSize;
    clampEditorCamera(s.camera, mapWidthPx, mapHeightPx, vp);

    // Rebuild chunks modified by editor tools
    if (s.dirtyChunks.size > 0) {
      for (const key of s.dirtyChunks) {
        const [cx, cy] = key.split(",").map(Number);
        this.chunkRenderer.rebuildChunk(cx, cy);
      }
      s.dirtyChunks.clear();
    }

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
  }

  render(alpha) {
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
    if (!hover) return;

    const ts = this.map.tileSize;
    const x = hover.x * ts;
    const y = hover.y * ts;

    this.hoverOverlay.rect(x, y, ts, ts);
    this.hoverOverlay.fill({ color: 0xffffff, alpha: 0.08 });
  }

  exit() {
    this.engine.renderer.stage.removeChild(this.root);
  }

  destroy() {
    this.gridOverlay?.destroy();
    this.brushPreview?.destroy();
    this.collisionDebug?.destroy();
    this.chunkDebug?.destroy();
    this.chunkRenderer?.destroy();
    this.root?.destroy({ children: true });
  }
}
