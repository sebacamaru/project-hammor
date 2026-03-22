import { Entity } from "../../shared/data/models/Entity.js";
import { PLAYER_SPEED, DEBUG_FLAGS } from "../../shared/core/Config.js";

const FACING_TO_DIR = { down: 0, left: 1, right: 2, up: 3 };

/** Maximum pending inputs before oldest is dropped (~6s at 20 TPS). */
const MAX_PENDING = 120;

export class Player extends Entity {
  constructor(x, y) {
    super(x, y);
    this.type = "player";
    this.speed = 2;
    this.moving = false;
    /** Hitbox relative to feet (x,y = center-bottom of sprite). */
    this.hitbox = { offsetX: -4, offsetY: -4, width: 8, height: 4 };

    /** Whether at least one server state has been received. */
    this.hasServerState = false;

    /** Buffer of inputs sent but not yet confirmed by the server. */
    this.pendingInputs = [];
  }

  /**
   * Saves prev positions for interpolation.
   * Prediction is called externally by SceneMap with input + collides.
   * @param {number} dt - Tick duration in milliseconds.
   */
  update(dt) {
    super.update(dt); // prevX = x, prevY = y
    this.syncLocalFromWorld();
  }

  /**
   * Applies local predicted movement based on current input.
   * Mirrors server MovementSystem logic: diagonal normalization,
   * per-axis collision resolution (X first, then Y), facing from input.
   * @param {number} dt - Tick duration in milliseconds.
   * @param {{ up: boolean, down: boolean, left: boolean, right: boolean }} input
   * @param {function(number, number, object): boolean} collides - Returns true if position collides.
   */
  predict(dt, input, collides) {
    let dx = 0;
    let dy = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;

    if (dx === 0 && dy === 0) {
      this.moving = false;
      return;
    }

    // Normalize diagonal so speed stays consistent
    if (dx !== 0 && dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
    }

    const distance = PLAYER_SPEED * (dt / 1000);

    // Per-axis collision (X first, then Y) — mirrors server MovementSystem
    const targetX = this.worldX + dx * distance;
    if (!collides(targetX, this.worldY, this.hitbox)) {
      this.worldX = targetX;
    }

    const targetY = this.worldY + dy * distance;
    if (!collides(this.worldX, targetY, this.hitbox)) {
      this.worldY = targetY;
    }

    // Facing from input intent (mirrors server)
    if (Math.abs(dx) > Math.abs(dy)) {
      this.direction = dx < 0 ? 1 : 2; // left : right
    } else {
      this.direction = dy < 0 ? 3 : 0; // up : down
    }

    this.moving = true;
  }

  /**
   * Records a sent input for later replay during reconciliation.
   * @param {number} seq - The sequence number assigned to this input.
   * @param {{ up: boolean, down: boolean, left: boolean, right: boolean }} input
   * @param {number} dt - Tick duration used for this prediction.
   */
  pushPendingInput(seq, input, dt) {
    if (this.pendingInputs.length >= MAX_PENDING) {
      this.pendingInputs.shift();
    }
    this.pendingInputs.push({ seq, input, dt });
  }

  /**
   * Snaps player to authoritative server state.
   * @param {{ x: number, y: number, vx: number, vy: number, facing: string }} state
   */
  setAuthoritativeState(state) {
    this.worldX = state.x;
    this.worldY = state.y;
    this.direction = FACING_TO_DIR[state.facing] ?? 0;
    this.moving = state.vx !== 0 || state.vy !== 0;
    this.syncLocalFromWorld();
  }

  /**
   * Reconciles predicted position with authoritative server snapshot.
   * Snaps to server position, discards confirmed inputs, replays pending ones.
   * @param {{ x: number, y: number, vx: number, vy: number, facing: string }} state
   * @param {number} lastProcessedSeq - Last input seq the server has processed.
   * @param {function(number, number, object): boolean} collides - Collision checker.
   */
  reconcile(state, lastProcessedSeq, collides) {
    if (!this.hasServerState) {
      this.setAuthoritativeState(state);
      this.prevX = this.x;
      this.prevY = this.y;
      this.hasServerState = true;
      this.pendingInputs = [];
      return;
    }

    // 1. Snap to authoritative position
    this.setAuthoritativeState(state);

    if (DEBUG_FLAGS.NET_ENABLE_CLIENT_PREDICTION && DEBUG_FLAGS.NET_ENABLE_RECONCILIATION) {
      // 2. Discard inputs already confirmed by server
      this.pendingInputs = this.pendingInputs.filter(
        (entry) => entry.seq > lastProcessedSeq,
      );

      // 3. Replay pending inputs
      for (const entry of this.pendingInputs) {
        this.predict(entry.dt, entry.input, collides);
      }
    } else {
      // No replay — clear pending inputs
      this.pendingInputs = [];
    }

    // 4. Sync final result
    this.syncLocalFromWorld();
    this.prevX = this.x;
    this.prevY = this.y;
  }
}
