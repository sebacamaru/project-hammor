import { Renderer } from "../shared/render/Renderer.js";
import { SceneManager } from "../shared/scene/SceneManager.js";
import { GameLoop } from "../shared/core/GameLoop.js";
import { DebugOverlay } from "../shared/render/DebugOverlay.js";
import { AssetManager } from "../shared/assets/AssetsManager.js";
import { Input } from "../shared/input/Input.js";
import { SceneEditor } from "./scenes/SceneEditor.js";

/**
 * Editor application shell.
 * Composes the same shared rendering pipeline as the client,
 * but without player, entities or gameplay logic.
 */
export class EditorApp {
  async start(rootElement) {
    this.renderer = new Renderer(rootElement);
    await this.renderer.init();

    // Cargar assets (tileset)
    await AssetManager.init();
    await AssetManager.loadBundle("core");

    // Input (keyboard polling)
    this.input = new Input();

    // Scene management
    this.scenes = new SceneManager(this);

    // Debug overlay
    this.debug = new DebugOverlay(this.renderer.stage);

    // Game loop
    this.loop = new GameLoop(this);
    await this.scenes.goto(new SceneEditor());
    this.loop.start();

    // Debug: expose in dev mode
    if (import.meta.env.DEV) {
      window.__editor = this;
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
