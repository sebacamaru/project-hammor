import { Renderer } from "../shared/render/Renderer.js";
import { GameLoop } from "../shared/core/GameLoop.js";
import { AssetManager } from "../shared/assets/AssetsManager.js";
import { Input } from "../shared/input/Input.js";
import { SceneManager } from "../shared/scene/SceneManager.js";
import { SceneMap } from "./scenes/SceneMap.js";
import { DebugOverlay } from "../shared/render/DebugOverlay.js";
import { ProjectSettings } from "../shared/data/loaders/ProjectSettings.js";

export class ClientApp {
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

    // Load project settings
    this.projectSettings = await ProjectSettings.load();

    // Start game loop
    this.loop = new GameLoop(this);
    const { gameStart } = this.projectSettings;
    await this.scenes.goto(new SceneMap(gameStart));
    this.loop.start();

    // Debug: expose app in dev mode
    if (import.meta.env.DEV) {
      window.__engine = this;
      window.toggleChunkDebug = () => {
        const overlay = this.scenes.current?.chunkDebug;
        if (overlay) {
          overlay.enabled = !overlay.enabled;
          console.log(`Chunk debug: ${overlay.enabled ? "on" : "off"}`);
        }
      };
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
