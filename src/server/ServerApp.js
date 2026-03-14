import { TICK_RATE, TICK_MS } from "../shared/core/Config.js";

/**
 * Server application skeleton.
 * Uses setInterval for the tick loop (no RAF in Node.js).
 * Does NOT import any PixiJS or rendering modules.
 */
export class ServerApp {
  constructor() {
    this.running = false;
    this.tickInterval = null;
    this.worlds = new Map();
  }

  start() {
    this.running = true;
    this.tickInterval = setInterval(() => this.tick(), TICK_MS);
    console.log(`Server started at ${TICK_RATE} ticks/sec`);
  }

  tick() {
    for (const world of this.worlds.values()) {
      world.update();
    }
  }

  stop() {
    this.running = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }
}
