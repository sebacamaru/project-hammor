import { Renderer } from "../shared/render/Renderer.js";
import { SceneManager } from "../shared/scene/SceneManager.js";
import { GameLoop } from "../shared/core/GameLoop.js";
import { DebugOverlay } from "../shared/render/DebugOverlay.js";

/**
 * Editor application shell.
 * Composes the same shared rendering pipeline as the client,
 * but will use its own scene types and input handling.
 */
export class EditorApp {
  async start(rootElement) {
    this.renderer = new Renderer(rootElement);
    await this.renderer.init();

    this.scenes = new SceneManager(this);
    this.debug = new DebugOverlay(this.renderer.stage);

    this.loop = new GameLoop(this);
    this.loop.start();
  }

  update(dt) {
    this.scenes.update(dt);
  }

  render(alpha) {
    this.scenes.render(alpha);
    this.debug.update(this.loop.lastFrameTime ?? 16);
  }
}
