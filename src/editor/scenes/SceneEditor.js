import { Container } from "pixi.js";
import { Scene } from "../../shared/scene/Scene.js";
import { Camera } from "../../shared/render/Camera.js";
import { GameMap } from "../../shared/data/models/GameMap.js";
import { MapChunkRenderer } from "../../shared/render/MapChunkRenderer.js";
import { TILE_SIZE } from "../../shared/core/Config.js";
import { TileLayerDebugOverlay } from "../../client/render/TileLayerDebugOverlay.js";
import { ChunkDebugOverlay } from "../../client/render/ChunkDebugOverlay.js";

export class SceneEditor extends Scene {
  async enter(engine) {
    this.engine = engine;
    this.root = new Container();
    engine.renderer.stage.addChild(this.root);

    const viewport = engine.renderer.viewport;

    // Cargar mapa
    this.map = await GameMap.load("/content/maps/test_map.json");

    // Cámara libre (sin player)
    this.camera = new Camera(viewport);
    this.camera.setBounds(this.map.width, this.map.height);
    this.camera.freeMode = true;

    // Tilemap por chunks
    this.chunkRenderer = new MapChunkRenderer(this.map, viewport, ["ground", "ground_detail", "fringe"]);
    this.root.addChild(this.chunkRenderer.getLayerContainer("ground"));
    this.root.addChild(this.chunkRenderer.getLayerContainer("ground_detail"));
    this.root.addChild(this.chunkRenderer.getLayerContainer("fringe"));

    // Debug overlays
    this.collisionDebug = new TileLayerDebugOverlay(this.map, viewport, "collision", 0xff0000);
    this.root.addChild(this.collisionDebug.container);

    this.chunkDebug = new ChunkDebugOverlay(this.map, viewport);
    this.root.addChild(this.chunkDebug.container);
  }

  update(dt) {
    const input = this.engine.input;
    const speed = this.camera.debugSpeed;

    // WASD mueve la cámara
    if (input.held("KeyW")) this.camera.y -= speed;
    if (input.held("KeyS")) this.camera.y += speed;
    if (input.held("KeyA")) this.camera.x -= speed;
    if (input.held("KeyD")) this.camera.x += speed;

    // IJKL también funciona
    this.camera.debugMove(input);

    // Debug overlay sync
    this.collisionDebug.enabled = this.engine.debug.visible;
    this.chunkDebug.enabled = this.engine.debug.visible;

    // Debug info
    const d = this.engine.debug;
    const vp = this.engine.renderer.viewport;
    d.set("cam", `${Math.round(this.camera.x)}, ${Math.round(this.camera.y)}`);
    d.set("viewport", `${vp.tilesX}x${vp.tilesY} @${vp.scale}x`);
    d.set("canvas", `${vp.cssWidth}x${vp.cssHeight}`);
  }

  render(alpha) {
    this.root.x = -this.camera.x;
    this.root.y = -this.camera.y;

    this.chunkRenderer.update(this.camera);
    this.collisionDebug.render(this.camera);
    this.chunkDebug.render(this.camera);
  }

  exit() {
    this.engine.renderer.stage.removeChild(this.root);
  }

  destroy() {
    this.collisionDebug.destroy();
    this.chunkDebug.destroy();
    this.chunkRenderer.destroy();
    this.root.destroy({ children: true });
  }
}
