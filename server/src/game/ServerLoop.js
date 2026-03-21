export class ServerLoop {
  constructor({ tickMs, onTick }) {
    this.tickMs = tickMs;
    this.onTick = onTick;
    this.intervalId = null;
    this.running = false;
  }

  start() {
    if (this.running) return;

    this.running = true;
    this.intervalId = setInterval(() => {
      this.onTick(this.tickMs);
    }, this.tickMs);
  }

  stop() {
    if (!this.running) return;

    clearInterval(this.intervalId);
    this.intervalId = null;
    this.running = false;
  }

  get isRunning() {
    return this.running;
  }
}
