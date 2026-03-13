import { Container } from "pixi.js";
import { Scene } from "./Scene.js";
import { Camera } from "../render/Camera.js";
import { GameMap } from "../world/GameMap.js";
import { TilemapRenderer } from "../world/TilemapRenderer.js";
import { EntityManager } from "../entity/EntityManager.js";
import { EntityRenderer } from "../entity/EntityRenderer.js";
import { Player } from "../entity/Player.js";
import { PlayerView } from "../entity/PlayerView.js";

export class SceneMap extends Scene {
  enter(engine) {
    this.engine = engine;
    this.root = new Container();
    engine.renderer.stage.addChild(this.root);

    const viewport = engine.renderer.viewport;

    // World data
    this.map = new GameMap(100, 100);

    // Camera
    this.camera = new Camera(viewport);
    this.camera.setBounds(this.map.width, this.map.height);

    // Tilemap rendering
    this.tileRenderer = new TilemapRenderer(this.map, viewport);
    this.root.addChild(this.tileRenderer.container);

    // Entities
    this.entityManager = new EntityManager();
    this.entityRenderer = new EntityRenderer(this.root);

    // Player — updated manually, not through EntityManager
    this.player = new Player(200, 200);
    this.playerView = new PlayerView(this.root);
    this.camera.follow(this.player);
  }

  update(dt) {
    this.player.update(dt, this.engine.input);
    this.entityManager.updateAll(dt, this.engine.input);

    // Debug camera
    if (this.engine.debug.visible) {
      this.camera.freeMode = true;
      this.camera.debugMove(this.engine.input);
    } else {
      this.camera.freeMode = false;
    }

    // Debug info
    const d = this.engine.debug;
    const vp = this.engine.renderer.viewport;
    d.set("cam", `${Math.round(this.camera.x)}, ${Math.round(this.camera.y)}`);
    d.set("player", `${Math.round(this.player.x)}, ${Math.round(this.player.y)}`);
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

    this.tileRenderer.render(this.camera);
    this.entityRenderer.sync(this.entityManager.getAll(), alpha);
    this.playerView.updateFromEntity(this.player, alpha);
  }

  exit() {
    this.engine.renderer.stage.removeChild(this.root);
  }

  destroy() {
    this.tileRenderer.destroy();
    this.entityRenderer.destroy();
    this.playerView.destroy();
    this.root.destroy({ children: true });
  }
}
