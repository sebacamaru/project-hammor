import { Entity } from "../../shared/data/models/Entity.js";

const FACING_TO_DIR = { down: 0, left: 1, right: 2, up: 3 };

export class Player extends Entity {
  constructor(x, y) {
    super(x, y);
    this.type = "player";
    this.speed = 2;
    this.moving = false;
    /** Hitbox relative to feet (x,y = center-bottom of sprite). */
    this.hitbox = { offsetX: -4, offsetY: -4, width: 8, height: 4 };
  }

  /**
   * Saves prev positions for interpolation.
   * No local movement — position comes exclusively from applyServerState().
   */
  update(dt) {
    super.update(dt);
  }

  /**
   * Applies authoritative server state from a snapshot.
   * Updates position, direction, and moving flag.
   * Saves prev positions for interpolation.
   * @param {{ x: number, y: number, vx: number, vy: number, facing: string }} state
   */
  applyServerState(state) {
    const dir = FACING_TO_DIR[state.facing] ?? 0;
    const moving = state.vx !== 0 || state.vy !== 0;

    // Skip micro-updates when position hasn't changed
    if (Math.abs(this.worldX - state.x) < 0.001 &&
        Math.abs(this.worldY - state.y) < 0.001) {
      this.direction = dir;
      this.moving = moving;
      return;
    }

    // Save prev for interpolation
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevWorldX = this.worldX;
    this.prevWorldY = this.worldY;

    // Apply server position
    this.worldX = state.x;
    this.worldY = state.y;
    this.syncLocalFromWorld();

    // Direction + animation state
    this.direction = dir;
    this.moving = moving;
  }
}
