/** Default input lock applied when a server-driven event starts. */
export const DEFAULT_EVENT_INPUT_LOCK = { move: false, interact: true };

/**
 * Per-player state for an active server-driven event sequence.
 * Created when an interaction resolves to commands[], cleared when the
 * sequence completes or the player disconnects.
 */
export class PlayerEventState {
  /**
   * @param {Array<object>} commands - The full commands array from the interaction.
   */
  constructor(commands) {
    /** @type {Array<object>} */
    this.commands = commands;

    /** @type {number} Current command index. */
    this.index = 0;

    /**
     * Current status of the event state machine.
     * - "ready": can process next command
     * - "waiting_ack": sent EVENT_MESSAGE, awaiting client ACK
     * - "waiting_ticks": wait command counting down
     * - "waiting_move": moveEntity in progress, waiting for scriptedMove to clear
     * @type {"ready"|"waiting_ack"|"waiting_ticks"|"waiting_move"}
     */
    this.status = "ready";

    /** @type {number} Target tick for wait commands. */
    this.waitUntilTick = 0;

    /** @type {string|null} runtimeId of entity being moved (for waiting_move). */
    this.moveTargetRuntimeId = null;

    /**
     * Granular input lock state for this event.
     * Controls which player inputs are blocked while the event is active.
     * @type {{ move: boolean, interact: boolean }}
     */
    this.inputLock = { ...DEFAULT_EVENT_INPUT_LOCK };
  }
}
