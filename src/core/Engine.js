import { Renderer } from "../render/Renderer.js";
import { GameLoop } from "./GameLoop.js";
import { AssetManager } from "../assets/AssetsManager.js";
import { Input } from "../input/Input.js";
import { SceneManager } from "../scene/SceneManager.js";
import { SceneMap } from "../scene/SceneMap.js";
import { DebugOverlay } from "../debug/DebugOverlay.js";

export class Engine {
  async start() {
    // Init renderer first (creates Pixi app + canvas)
    this.renderer = new Renderer(document.getElementById("game"));
    await this.renderer.init();

    // Load assets
    await AssetManager.init();
    await AssetManager.loadBundle("core");

    // Input
    this.input = new Input();

    // Scene management
    this.scenes = new SceneManager(this);

    // Debug overlay
    this.debug = new DebugOverlay(this.renderer.stage);

    // Start game loop
    this.loop = new GameLoop(this);
    this.scenes.goto(new SceneMap());
    this.loop.start();

    // Debug: expose engine in dev mode
    if (import.meta.env.DEV) {
      window.__engine = this;
    }
  }

  update(dt) {
    this.input.poll();
    if (this.input.pressed("Escape")) {
      this.debug.toggle();
    }
    this.scenes.update(dt);
  }

  render(alpha) {
    this.scenes.render(alpha);
    this.debug.update(this.loop.lastFrameTime ?? 16);
  }
}
