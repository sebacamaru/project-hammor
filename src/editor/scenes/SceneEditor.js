import { Container } from "pixi.js";
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
  }

  update(dt) {
    const s = this.state.get();
    const vp = this.engine.renderer.viewport;

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
  }

  render(alpha) {
    this.root.x = Math.floor(-this.camera.x);
    this.root.y = Math.floor(-this.camera.y);

    this.chunkRenderer.update(this.camera);
    this.collisionDebug.render(this.camera);
    this.chunkDebug.render(this.camera);
  }

  exit() {
    this.engine.renderer.stage.removeChild(this.root);
  }

  destroy() {
    this.collisionDebug?.destroy();
    this.chunkDebug?.destroy();
    this.chunkRenderer?.destroy();
    this.root?.destroy({ children: true });
  }
}
