/**
 * Fixed-timestep server loop using setInterval.
 * Calls onTick(tickMs) at a fixed interval. No RAF — this is server-side.
 */
export class ServerLoop {
  /**
   * @param {object} options
   * @param {number} options.tickMs - Interval in milliseconds between ticks.
   * @param {(dt: number) => void} options.onTick - Callback invoked each tick with dt in ms.
   */
  constructor({ tickMs, onTick }) {
    this.tickMs = tickMs;
    this.onTick = onTick;
    this.intervalId = null;
    this.running = false;
  }

  /** Starts the loop. No-op if already running. */
  start() {
    if (this.running) return;

    this.running = true;
    this.intervalId = setInterval(() => {
      this.onTick(this.tickMs);
    }, this.tickMs);
  }

  /** Stops the loop and clears the interval. No-op if not running. */
  stop() {
    if (!this.running) return;

    clearInterval(this.intervalId);
    this.intervalId = null;
    this.running = false;
  }

  /** @returns {boolean} Whether the loop is currently running. */
  get isRunning() {
    return this.running;
  }
}
