import { Container } from "pixi.js";
import { Scene } from "../../shared/scene/Scene.js";
import { Camera } from "../../shared/render/Camera.js";
import { GameMap } from "../../shared/data/models/GameMap.js";
import { TilemapRenderer } from "../../shared/render/TilemapRenderer.js";
import { TILE_SIZE } from "../../shared/core/Config.js";
import { EntityManager } from "../../shared/data/models/EntityManager.js";
import { EntityRenderer } from "../../shared/render/EntityRenderer.js";
import { Player } from "../game/Player.js";
import { PlayerView } from "../game/PlayerView.js";
import { ChunkDebugOverlay } from "../render/ChunkDebugOverlay.js";
import { TileLayerDebugOverlay } from "../render/TileLayerDebugOverlay.js";
import { HitboxDebugOverlay } from "../render/HitboxDebugOverlay.js";

export class SceneMap extends Scene {
  async enter(engine) {
    this.engine = engine;
    this.root = new Container();
    engine.renderer.stage.addChild(this.root);

    const viewport = engine.renderer.viewport;

    // World data
    this.map = await GameMap.load("/content/maps/test_map.json");

    // Camera
    this.camera = new Camera(viewport);
    this.camera.setBounds(this.map.width, this.map.height);

    // Tilemap rendering — z-order: ground, ground_detail, entities/player, fringe, debug
    this.groundRenderer = new TilemapRenderer(this.map, viewport, "ground");
    this.root.addChild(this.groundRenderer.container);

    this.groundDetailRenderer = new TilemapRenderer(this.map, viewport, "ground_detail");
    this.root.addChild(this.groundDetailRenderer.container);

    // Entities
    this.entityManager = new EntityManager();
    this.entityRenderer = new EntityRenderer(this.root);

    // Player — updated manually, not through EntityManager
    this.player = new Player(200, 200);
    this.playerView = new PlayerView(this.root);
    this.camera.follow(this.player);

    // Fringe layer — renders above entities/player
    this.fringeRenderer = new TilemapRenderer(this.map, viewport, "fringe");
    this.root.addChild(this.fringeRenderer.container);

    // Debug overlays (sync with debug mode)
    this.collisionDebug = new TileLayerDebugOverlay(this.map, viewport, "collision", 0xff0000);
    this.root.addChild(this.collisionDebug.container);

    this.hitboxDebug = new HitboxDebugOverlay();
    this.root.addChild(this.hitboxDebug.container);

    this.chunkDebug = new ChunkDebugOverlay(this.map, viewport);
    this.chunkDebug.enabled = false;
    this.root.addChild(this.chunkDebug.container);
  }

  update(dt) {
    this.player.update(dt, this.engine.input, this.map);
    this.entityManager.updateAll(dt, this.engine.input);

    // Debug overlays
    this.collisionDebug.enabled = this.engine.debug.visible;
    this.hitboxDebug.enabled = this.engine.debug.visible;
    this.chunkDebug.enabled = this.engine.debug.visible;

    // Debug camera: IJKL enters free mode, WASD returns to follow
    const input = this.engine.input;
    if (input.held("KeyI") || input.held("KeyJ") || input.held("KeyK") || input.held("KeyL")) {
      this.camera.freeMode = true;
      this.camera.debugMove(input);
    } else if (input.held("KeyW") || input.held("KeyA") || input.held("KeyS") || input.held("KeyD")) {
      this.camera.freeMode = false;
    }

    // Debug info
    const d = this.engine.debug;
    const vp = this.engine.renderer.viewport;
    d.set("cam", `${Math.round(this.camera.x)}, ${Math.round(this.camera.y)}`);
    d.set("player", `${Math.round(this.player.x)}, ${Math.round(this.player.y)}`);
    // Use sprite center (8px offset) for chunk calculation
    const tileX = Math.floor((this.player.x + 8) / TILE_SIZE);
    const tileY = Math.floor((this.player.y + 8) / TILE_SIZE);
    const { cx, cy } = this.map.worldToChunk(tileX, tileY);
    d.set("chunk", `${cx}, ${cy}`);
    d.set("entities", this.entityManager.entities.size);
    d.set("viewport", `${vp.tilesX}x${vp.tilesY} @${vp.scale}x`);
    d.set("canvas", `${vp.cssWidth}x${vp.cssHeight}`);
    const el = this.engine.renderer.rootElement;
    d.set("container", `${el.clientWidth}x${el.clientHeight}`);
  }

  render(alpha) {
    this.camera.renderUpdate(this.player, alpha);

    this.root.x = -this.camera.x;
    this.root.y = -this.camera.y;

    this.groundRenderer.render(this.camera);
    this.groundDetailRenderer.render(this.camera);
    this.fringeRenderer.render(this.camera);
    this.collisionDebug.render(this.camera);
    this.chunkDebug.render(this.camera);
    this.entityRenderer.sync(this.entityManager.getAll(), alpha);
    this.playerView.updateFromEntity(this.player, alpha);
    this.hitboxDebug.render(this.player);
  }

  exit() {
    this.engine.renderer.stage.removeChild(this.root);
  }

  destroy() {
    this.collisionDebug.destroy();
    this.hitboxDebug.destroy();
    this.chunkDebug.destroy();
    this.groundRenderer.destroy();
    this.groundDetailRenderer.destroy();
    this.fringeRenderer.destroy();
    this.entityRenderer.destroy();
    this.playerView.destroy();
    this.root.destroy({ children: true });
  }
}
