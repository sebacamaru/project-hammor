import { PlayerInputState } from "../input/PlayerInputState.js";

/**
 * Server-side player entity.
 * Holds position, velocity, facing, and current input state.
 * No rendering or PixiJS dependencies.
 */
export class ServerPlayer {
  /**
   * @param {string} id - Unique player id (e.g. "p1").
   * @param {string|null} worldId - The world this player belongs to, or null for single-map mode.
   * @param {string} mapId - The map this player is currently in.
   * @param {number} x - Initial x position in pixels (map-local).
   * @param {number} y - Initial y position in pixels (map-local).
   */
  constructor(id, worldId, mapId, x, y) {
    this.id = id;
    this.type = "player";
    this.worldId = worldId;
    this.mapId = mapId;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = "down";
    /** Hitbox relative to feet (x,y = center-bottom of sprite). */
    this.hitbox = { offsetX: -4, offsetY: -4, width: 8, height: 4 };
    this.input = new PlayerInputState();
    /** Last input sequence number processed by the server. */
    this.lastProcessedSeq = -1;
  }

  /**
   * Returns a plain object snapshot of this player for serialization (welcome, snapshots).
   * Does not include input state.
   * @returns {object}
   */
  toData() {
    return {
      id: this.id,
      type: this.type,
      worldId: this.worldId,
      mapId: this.mapId,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      facing: this.facing,
    };
  }
}
