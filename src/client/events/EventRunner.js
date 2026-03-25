const VALID_DIRECTIONS = new Set(["down", "left", "right", "up"]);

/**
 * Minimal sequential command runner for scripted interactions and cutscenes.
 * Executes an array of commands in order. Supports "message", "wait", and "faceEntity".
 * Prevents overlapping runs. No cancellation support yet (see Phase 3 caveats).
 */
export class EventRunner {
  /**
   * @param {object} deps
   * @param {import("../ui/GameMessageBox.js").GameMessageBox} deps.messageBox
   * @param {(authoredId: string) => { entity: object, view: object } | null} deps.findEntity
   */
  constructor({ messageBox, findEntity }) {
    this._messageBox = messageBox;
    this._findEntity = findEntity;
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
      case "faceEntity": {
        if (!VALID_DIRECTIONS.has(cmd.dir)) {
          console.warn(`[EventRunner] Invalid direction: "${cmd.dir}"`, cmd);
          break;
        }
        const entry = this._findEntity(cmd.target);
        if (!entry) {
          console.warn(`[EventRunner] Entity not found: "${cmd.target}"`, cmd);
          break;
        }
        if (!entry.entity?.visual || !entry.view) {
          console.warn(`[EventRunner] Entity has no visual component: "${cmd.target}"`, cmd);
          break;
        }
        entry.entity.visual.direction = cmd.dir;
        entry.view.updateFromEntity(entry.entity);
        break;
      }
      default:
        console.warn(`[EventRunner] Unknown command type: "${cmd.type}"`, cmd);
    }
  }
}
