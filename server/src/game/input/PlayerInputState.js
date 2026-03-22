/**
 * Holds the last known input state for a player.
 * Updated via apply() when a valid input message arrives with a newer seq.
 * Read by MovementSystem each tick to determine movement direction.
 */
export class PlayerInputState {
  constructor() {
    /** Sequence number of the last accepted input. Starts at -1 so seq 0 is accepted. */
    this.seq = -1;
    this.up = false;
    this.down = false;
    this.left = false;
    this.right = false;
  }

  /**
   * Overwrites the current input state with new values.
   * Caller is responsible for checking seq > this.seq before calling.
   * @param {number} seq - The input sequence number.
   * @param {object} input - The directional flags { up, down, left, right }.
   */
  apply(seq, input) {
    this.seq = seq;
    this.up = input.up;
    this.down = input.down;
    this.left = input.left;
    this.right = input.right;
  }
}
