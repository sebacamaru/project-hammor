import { TILE_SIZE, DEFAULT_ENTITY_HITBOX } from "../../../../src/shared/core/Config.js";

const VALID_DIRECTIONS = new Set(["down", "left", "right", "up"]);

const DIR_DELTAS = {
  up:    { dx: 0, dy: -1 },
  down:  { dx: 0, dy: 1 },
  left:  { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

const MAX_STEPS = 8;

/**
 * Applies world-affecting interaction commands on the server before returning
 * the interaction result to the client. Non-world-affecting commands (message,
 * wait) are ignored here — the client EventRunner handles those.
 * @param {Array<object>} commands - The resolved commands array.
 * @param {object} ctx
 * @param {(authoredId: string) => object|null} ctx.findEntityByAuthoredId
 * @param {(mapId: string) => object|null} ctx.getMap
 * @param {import("../systems/CollisionSystem.js").CollisionSystem} ctx.collisionSystem
 * @param {string} ctx.logTag - Prefix for log/warn messages.
 */
export function applyInteractionCommands(commands, { findEntityByAuthoredId, getMap, collisionSystem, logTag }) {
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

        const map = getMap(entity.mapId);
        if (!map) {
          console.warn(`${logTag} moveEntity map not loaded: ${entity.mapId}`, cmd);
          break;
        }

        // Resolve hitbox (authored collision component or default)
        const hitbox = entity.components?.collision?.hitbox ?? DEFAULT_ENTITY_HITBOX;
        const delta = DIR_DELTAS[cmd.dir];

        // Move one tile at a time, stop on first blocked
        for (let i = 0; i < steps; i++) {
          const nx = entity.x + delta.dx * TILE_SIZE;
          const ny = entity.y + delta.dy * TILE_SIZE;
          if (!collisionSystem.isWalkable(map, nx, ny, hitbox)) break;
          entity.x = nx;
          entity.y = ny;
        }

        // Always face the movement direction, even if blocked on first step
        if (entity.components?.visual) {
          entity.components.visual.direction = cmd.dir;
        }
        break;
      }

      default:
        // Non-world-affecting commands (message, wait) — client handles these
        break;
    }
  }
}
