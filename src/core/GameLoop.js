import { TICK_MS } from "./Config.js";

export class GameLoop {
  constructor(engine) {
    this.engine = engine;
    this.running = false;
    this.accumulator = 0;
    this.lastTime = 0;
    this.lastFrameTime = 0;
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    this._frame(this.lastTime);
  }

  _frame(now) {
    if (!this.running) return;

    const frameTime = Math.min(now - this.lastTime, 200);
    this.lastTime = now;
    this.lastFrameTime = frameTime;
    this.accumulator += frameTime;

    while (this.accumulator >= TICK_MS) {
      this.engine.update(TICK_MS);
      this.accumulator -= TICK_MS;
    }

    const alpha = this.accumulator / TICK_MS;
    this.engine.render(alpha);

    requestAnimationFrame((t) => this._frame(t));
  }

  stop() {
    this.running = false;
  }
}
