/** Maximum queued inputs before oldest is dropped (safety against flood). */
const MAX_QUEUE = 120;

/**
 * Holds queued input states for a player.
 * Inputs are enqueued as they arrive from the network, then drained
 * by MovementSystem each tick for per-input processing.
 * Also maintains "last known" directional flags as a fallback
 * when the queue is empty (e.g. network hiccup).
 */
export class PlayerInputState {
  constructor() {
    /** Sequence number of the last accepted input. Starts at -1 so seq 0 is accepted. */
    this.lastSeq = -1;

    /** @type {{ seq: number, input: { up: boolean, down: boolean, left: boolean, right: boolean } }[]} */
    this.queue = [];

    // Last known directional state (fallback when queue is empty)
    this.up = false;
    this.down = false;
    this.left = false;
    this.right = false;
  }

  /**
   * Queues an input for later processing by MovementSystem.
   * Ignores stale or duplicate inputs (seq must be > lastSeq).
   * Also updates the "last known" directional flags for fallback use.
   * @param {number} seq - The input sequence number.
   * @param {{ up: boolean, down: boolean, left: boolean, right: boolean }} input - Directional flags.
   */
  enqueue(seq, input) {
    if (seq <= this.lastSeq) return;
    this.lastSeq = seq;

    // Update last known state for fallback
    this.up = input.up;
    this.down = input.down;
    this.left = input.left;
    this.right = input.right;

    this.queue.push({ seq, input });

    // Cap queue size
    if (this.queue.length > MAX_QUEUE) {
      this.queue.shift();
    }
  }

  /**
   * Drains and returns all queued inputs, clearing the queue.
   * Called once per tick by MovementSystem.
   * @returns {{ seq: number, input: { up: boolean, down: boolean, left: boolean, right: boolean } }[]}
   */
  drain() {
    const items = this.queue;
    this.queue = [];
    return items;
  }
}
