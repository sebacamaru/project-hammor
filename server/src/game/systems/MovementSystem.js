/**
 * Authoritative movement system.
 * Each tick, reads every player's current input, applies velocity + position changes,
 * and validates against collision before committing movement.
 * Resolves per-axis for wall sliding.
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
   */
  update(players, dt, config, runtimeMaps, collisionSystem, runtimeWorlds = null) {
    if (!config?.playerSpeed || dt <= 0) return;

    const speed = config.playerSpeed;
    const distance = speed * (dt / 1000);

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

      // Resolve X axis
      const targetX = player.x + dx * distance;
      if (collisionSystem.isWalkable(map, targetX, player.y, player.hitbox, openBorders)) {
        player.x = targetX;
        player.vx = dx * speed;
      } else {
        player.vx = 0;
      }

      // Resolve Y axis (using updated player.x from above)
      const targetY = player.y + dy * distance;
      if (collisionSystem.isWalkable(map, player.x, targetY, player.hitbox, openBorders)) {
        player.y = targetY;
        player.vy = dy * speed;
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
}
