import { DEFAULT_ENTITY_HITBOX } from "../../../../src/shared/core/Config.js";

/**
 * Authoritative movement system.
 * Each tick, reads every player's current input, applies velocity + position changes,
 * and validates against collision before committing movement.
 * Resolves per-axis for wall sliding.
 * Checks both tile collision and solid entity collision (AABB-vs-AABB).
 */
export class MovementSystem {
  constructor() {
    /** @type {Set<string>} mapIds that have already been warned about (throttle) */
    this.warnedMaps = new Set();
  }

  /**
   * Updates all players' positions based on their current input state.
   * Per-axis collision resolution: tries X first, then Y.
   * Passes open border flags to collision so players can cross into neighbor maps.
   * @param {Map<string, ServerPlayer>} players - All active players.
   * @param {number} dt - Tick duration in milliseconds.
   * @param {object} config - Server config (needs playerSpeed).
   * @param {RuntimeMapManager} runtimeMaps - Loaded runtime maps.
   * @param {CollisionSystem} collisionSystem - Collision checker.
   * @param {RuntimeWorldManager|null} runtimeWorlds - Loaded worlds (null in single-map mode).
   * @param {ServerEntityManager|null} serverEntities - Entity registry for solid entity checks.
   */
  update(players, dt, config, runtimeMaps, collisionSystem, runtimeWorlds = null, serverEntities = null) {
    if (!config?.playerSpeed || dt <= 0) return;

    const speed = config.playerSpeed;
    const distance = speed * (dt / 1000);

    // Cache solid entity rects per mapId to avoid rebuilding for players on the same map
    const solidCache = new Map();

    for (const player of players.values()) {
      const { input } = player;
      let dx = 0;
      let dy = 0;

      if (input.left) dx -= 1;
      if (input.right) dx += 1;
      if (input.up) dy -= 1;
      if (input.down) dy += 1;

      // No input → stop velocity, keep facing
      if (dx === 0 && dy === 0) {
        player.vx = 0;
        player.vy = 0;
        continue;
      }

      // Normalize diagonal so speed stays consistent
      if (dx !== 0 && dy !== 0) {
        const len = Math.hypot(dx, dy);
        dx /= len;
        dy /= len;
      }

      // Get the map for this player
      const map = runtimeMaps.getMap(player.mapId);
      if (!map) {
        if (!this.warnedMaps.has(player.mapId)) {
          console.warn(`[MovementSystem] No map loaded for "${player.mapId}"`);
          this.warnedMaps.add(player.mapId);
        }
        player.vx = 0;
        player.vy = 0;
        continue;
      }

      // Look up open borders for world-aware collision
      const openBorders = player.worldId
        ? runtimeWorlds?.getOpenBorders(player.worldId, player.mapId)
        : null;

      // Get solid entity rects for this map (cached per tick)
      if (!solidCache.has(player.mapId)) {
        solidCache.set(player.mapId, serverEntities ? this._getSolidEntityRects(serverEntities, player.mapId) : []);
      }
      const solidRects = solidCache.get(player.mapId);

      // Resolve X axis
      const targetX = player.x + dx * distance;
      if (collisionSystem.isWalkable(map, targetX, player.y, player.hitbox, openBorders)) {
        if (!this._collidesWithEntities(targetX, player.y, player.hitbox, solidRects)) {
          player.x = targetX;
          player.vx = dx * speed;
        } else {
          player.vx = 0;
        }
      } else {
        player.vx = 0;
      }

      // Resolve Y axis (using updated player.x from above)
      const targetY = player.y + dy * distance;
      if (collisionSystem.isWalkable(map, player.x, targetY, player.hitbox, openBorders)) {
        if (!this._collidesWithEntities(player.x, targetY, player.hitbox, solidRects)) {
          player.y = targetY;
          player.vy = dy * speed;
        } else {
          player.vy = 0;
        }
      } else {
        player.vy = 0;
      }

      // Facing reflects input intent, not collision result
      if (Math.abs(dx) > Math.abs(dy)) {
        player.facing = dx < 0 ? "left" : "right";
      } else {
        player.facing = dy < 0 ? "up" : "down";
      }
    }
  }

  /**
   * Returns prebuilt map-local AABB rects for solid entities on a given map.
   * Filters entities with components.collision.solid === true.
   * Falls back to DEFAULT_ENTITY_HITBOX if hitbox is missing or malformed.
   * @param {ServerEntityManager} serverEntities
   * @param {string} mapId
   * @returns {{ left: number, top: number, right: number, bottom: number }[]}
   */
  _getSolidEntityRects(serverEntities, mapId) {
    const result = [];
    for (const entity of serverEntities.getByMap(mapId)) {
      const col = entity.components.collision;
      if (!col || col.solid !== true) continue;

      const hb = this._resolveHitbox(col.hitbox);
      result.push({
        left: entity.x + hb.offsetX,
        top: entity.y + hb.offsetY,
        right: entity.x + hb.offsetX + hb.width,
        bottom: entity.y + hb.offsetY + hb.height,
      });
    }
    return result;
  }

  /**
   * Validates and returns a hitbox, falling back to DEFAULT_ENTITY_HITBOX if malformed.
   * @param {object|undefined} hitbox - Authored hitbox from collision component.
   * @returns {{ offsetX: number, offsetY: number, width: number, height: number }}
   */
  _resolveHitbox(hitbox) {
    if (
      hitbox &&
      typeof hitbox.offsetX === "number" &&
      typeof hitbox.offsetY === "number" &&
      typeof hitbox.width === "number" &&
      typeof hitbox.height === "number" &&
      hitbox.width > 0 &&
      hitbox.height > 0
    ) {
      return hitbox;
    }
    return DEFAULT_ENTITY_HITBOX;
  }

  /**
   * Checks if a player hitbox at a candidate feet position overlaps any solid entity rect.
   * Uses strict inequality (> / <) so edge contact is allowed (less sticky feel).
   * @param {number} x - Candidate player feet X (map-local).
   * @param {number} y - Candidate player feet Y (map-local).
   * @param {{ offsetX: number, offsetY: number, width: number, height: number }} playerHitbox
   * @param {{ left: number, top: number, right: number, bottom: number }[]} solidRects
   * @returns {boolean} True if any overlap.
   */
  _collidesWithEntities(x, y, playerHitbox, solidRects) {
    const pLeft = x + playerHitbox.offsetX;
    const pTop = y + playerHitbox.offsetY;
    const pRight = pLeft + playerHitbox.width;
    const pBottom = pTop + playerHitbox.height;

    for (const r of solidRects) {
      if (pRight > r.left && pLeft < r.right && pBottom > r.top && pTop < r.bottom) {
        return true;
      }
    }
    return false;
  }
}
