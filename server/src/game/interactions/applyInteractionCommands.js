const VALID_DIRECTIONS = new Set(["down", "left", "right", "up"]);

/**
 * Applies world-affecting interaction commands on the server before returning
 * the interaction result to the client. Non-world-affecting commands (message,
 * wait) are ignored here — the client EventRunner handles those.
 * @param {Array<object>} commands - The resolved commands array.
 * @param {object} ctx
 * @param {(authoredId: string) => object|null} ctx.findEntityByAuthoredId
 * @param {string} ctx.logTag - Prefix for log/warn messages.
 */
export function applyInteractionCommands(commands, { findEntityByAuthoredId, logTag }) {
  if (!Array.isArray(commands) || commands.length === 0) return;

  for (const cmd of commands) {
    if (!cmd || !cmd.type) continue;

    switch (cmd.type) {
      case "faceEntity": {
        if (!VALID_DIRECTIONS.has(cmd.dir)) {
          console.warn(`${logTag} Invalid faceEntity dir`, cmd);
          break;
        }
        const entity = findEntityByAuthoredId(cmd.target);
        if (!entity) {
          console.warn(`${logTag} faceEntity target not found`, cmd);
          break;
        }
        if (!entity.components?.visual) {
          console.warn(`${logTag} faceEntity target has no visual`, cmd);
          break;
        }
        entity.components.visual.direction = cmd.dir;
        break;
      }
      default:
        // Non-world-affecting commands (message, wait) — client handles these
        break;
    }
  }
}
