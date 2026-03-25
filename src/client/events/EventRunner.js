/**
 * Minimal sequential command runner for scripted interactions and cutscenes.
 * Executes an array of commands in order. Currently supports "message" and "wait".
 * Prevents overlapping runs. No cancellation support yet (see Phase 3 caveats).
 */
export class EventRunner {
  /**
   * @param {import("../ui/GameMessageBox.js").GameMessageBox} messageBox
   */
  constructor(messageBox) {
    this._messageBox = messageBox;
    this._running = false;
  }

  /**
   * Returns whether a command sequence is currently executing.
   * @returns {boolean}
   */
  isRunning() {
    return this._running;
  }

  /**
   * Executes a sequence of commands in order.
   * If already running, logs a warning and returns.
   * @param {Array<object>} commands - Array of command objects with a `type` field.
   * @returns {Promise<void>}
   */
  async run(commands) {
    if (this._running) {
      console.warn("[EventRunner] Already running, ignoring new run");
      return;
    }
    if (!Array.isArray(commands) || commands.length === 0) return;

    this._running = true;
    try {
      for (const cmd of commands) {
        await this._execute(cmd);
      }
    } finally {
      this._running = false;
    }
  }

  /**
   * Executes a single command. Warns and continues on invalid or unknown types.
   * @param {object} cmd - Command object with at least a `type` field.
   * @returns {Promise<void>}
   * @private
   */
  async _execute(cmd) {
    if (!cmd || !cmd.type) {
      console.warn("[EventRunner] Invalid command", cmd);
      return;
    }

    switch (cmd.type) {
      case "message":
        await this._messageBox.show({ text: cmd.text, speaker: cmd.speaker ?? null });
        break;
      case "wait":
        await new Promise(resolve => setTimeout(resolve, Math.max(0, cmd.ms ?? 0)));
        break;
      default:
        console.warn(`[EventRunner] Unknown command type: "${cmd.type}"`, cmd);
    }
  }
}
