import { Renderer } from "../shared/render/Renderer.js";
import { GameLoop } from "../shared/core/GameLoop.js";
import { AssetManager } from "../shared/assets/AssetsManager.js";
import { Input } from "../shared/input/Input.js";
import { SceneManager } from "../shared/scene/SceneManager.js";
import { SceneMap } from "./scenes/SceneMap.js";
import { DebugOverlay } from "../shared/render/DebugOverlay.js";
import { ProjectSettings } from "../shared/data/loaders/ProjectSettings.js";
import { DEBUG_FLAGS } from "../shared/core/Config.js";
import { GameUIRoot } from "./ui/GameUIRoot.js";

export class ClientApp {
  async start() {
    const gameEl = document.getElementById("game");

    // Init renderer first (creates Pixi app + canvas)
    this.renderer = new Renderer(gameEl);
    await this.renderer.init();

    // DOM UI root — sits above canvas for in-game overlays
    this.gameUIRoot = new GameUIRoot(gameEl);

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
      window.__debugFlags = DEBUG_FLAGS;
      window.toggleChunkDebug = () => {
        const overlay = this.scenes.current?.chunkDebug;
        if (overlay) {
          overlay.enabled = !overlay.enabled;
          console.log(`Chunk debug: ${overlay.enabled ? "on" : "off"}`);
        }
      };
      window.testEventRunner = () => {
        const scene = this.scenes.current;
        if (!scene?.eventRunner) {
          console.warn("[testEventRunner] No current scene with eventRunner");
          return;
        }
        void scene.eventRunner.run([
          { type: "message", text: "One" },
          { type: "wait", ms: 300 },
          { type: "message", text: "Two" },
        ]);
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
