const VALID_DIRECTIONS = new Set(["down", "left", "right", "up"]);

/** @type {Record<string, { dx: number, dy: number }>} */
export const DIR_DELTAS = {
  up:    { dx: 0, dy: -1 },
  down:  { dx: 0, dy: 1 },
  left:  { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

const MAX_STEPS = 8;

export const DEFAULT_SCRIPTED_STEP_TICKS = 3;

/**
 * Resolves the step interval (ticks per tile) for a moveEntity command.
 * Fallback chain: cmd.speed → entity.components.movement.speed → global default.
 * Clamped to 1..10.
 * @param {object} cmd - The moveEntity command.
 * @param {import("../entities/GameEntity.js").GameEntity} entity - Target entity.
 * @returns {number}
 */
export function resolveStepTicks(cmd, entity) {
  let stepTicks = cmd.speed;
  if (!Number.isFinite(stepTicks)) stepTicks = entity.components?.movement?.speed;
  if (!Number.isFinite(stepTicks)) stepTicks = DEFAULT_SCRIPTED_STEP_TICKS;
  return Math.max(1, Math.min(10, Math.floor(stepTicks)));
}

/**
 * Applies world-affecting interaction commands on the server before returning
 * the interaction result to the client. Non-world-affecting commands (message,
 * wait) are ignored here — the client EventRunner handles those.
 *
 * `moveEntity` enqueues stepped movement (processed per-tick in GameServer)
 * rather than applying all steps immediately.
 *
 * @param {Array<object>} commands - The resolved commands array.
 * @param {object} ctx
 * @param {(authoredId: string) => import("../entities/GameEntity.js").GameEntity|null} ctx.findEntityByAuthoredId
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

      case "moveEntity": {
        if (!VALID_DIRECTIONS.has(cmd.dir)) {
          console.warn(`${logTag} Invalid moveEntity dir`, cmd);
          break;
        }
        let steps = Number.isFinite(cmd.steps) ? Math.floor(cmd.steps) : 1;
        steps = Math.max(1, Math.min(MAX_STEPS, steps));

        const entity = findEntityByAuthoredId(cmd.target);
        if (!entity) {
          console.warn(`${logTag} moveEntity target not found`, cmd);
          break;
        }

        // Enqueue steps (append to existing queue so chained moveEntity commands work)
        // Facing is updated per-step in _processScriptedMovement, not upfront
        const newSteps = [];
        for (let i = 0; i < steps; i++) newSteps.push({ dir: cmd.dir });
        if (entity.scriptedMove) {
          entity.scriptedMove.queue.push(...newSteps);
        } else {
          entity.scriptedMove = { queue: newSteps, stepTicks: resolveStepTicks(cmd, entity), active: null };
        }
        break;
      }

      default:
        // Non-world-affecting commands (message, wait) — client handles these
        break;
    }
  }
}
