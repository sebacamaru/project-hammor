import { Entity } from "../../shared/data/models/Entity.js";
import {
  PLAYER_SPEED,
  DEBUG_FLAGS,
  REMOTE_INTERPOLATION_DELAY_MS,
  MAX_REMOTE_SNAPSHOTS,
} from "../../shared/core/Config.js";

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

    /** Whether this player is controlled remotely (snapshot-driven, no prediction). */
    this.isRemote = false;

    /** Whether at least one server state has been received. */
    this.hasServerState = false;

    /** Timestamped snapshot buffer for remote player interpolation. */
    this.snapshotBuffer = [];

    /** Buffer of inputs sent but not yet confirmed by the server. */
    this.pendingInputs = [];
  }

  /**
   * Saves prev positions for interpolation.
   * For remote players, lerps toward the latest server position.
   * For the local player, prediction is called externally by SceneMap.
   * @param {number} dt - Tick duration in milliseconds.
   */
  update(dt) {
    super.update(dt); // prevX = x, prevY = y

    if (this.isRemote) return; // Interpolation handled by updateRemoteInterpolation()

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
   * Stores a snapshot for a remote player into the interpolation buffer.
   * On the first snapshot, snaps position immediately so the player is visible.
   * @param {{ x: number, y: number, vx: number, vy: number, facing: string }} state
   * @param {number} receivedAt - Timestamp from performance.now() when the snapshot arrived.
   */
  pushRemoteSnapshot(state, receivedAt) {
    this.snapshotBuffer.push({
      x: state.x,
      y: state.y,
      vx: state.vx,
      vy: state.vy,
      facing: state.facing,
      time: receivedAt,
    });

    if (this.snapshotBuffer.length > MAX_REMOTE_SNAPSHOTS) {
      this.snapshotBuffer.shift();
    }

    if (!this.hasServerState) {
      this.worldX = state.x;
      this.worldY = state.y;
      this.syncLocalFromWorld();
      this.prevX = this.x;
      this.prevY = this.y;
      this.direction = FACING_TO_DIR[state.facing] ?? 0;
      this.moving = state.vx !== 0 || state.vy !== 0;
      this.hasServerState = true;
    }
  }

  /**
   * Interpolates remote player position from the snapshot buffer.
   * Renders with a deliberate delay so two bracketing snapshots are available
   * for smooth linear interpolation. Called once per render frame.
   * @param {number} now - Current timestamp from performance.now().
   */
  updateRemoteInterpolation(now) {
    const buf = this.snapshotBuffer;
    if (buf.length === 0) return;

    const renderTime = now - REMOTE_INTERPOLATION_DELAY_MS;

    // Find bracketing snapshots: from.time <= renderTime < to.time
    let fromIdx = -1;
    let toIdx = -1;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i].time <= renderTime) {
        fromIdx = i;
      } else {
        toIdx = i;
        break;
      }
    }

    let interpX, interpY, snap;

    if (fromIdx >= 0 && toIdx >= 0) {
      // Normal case: interpolate between two bracketing snapshots
      const from = buf[fromIdx];
      const to = buf[toIdx];
      const range = to.time - from.time;
      const t = range > 0 ? Math.max(0, Math.min(1, (renderTime - from.time) / range)) : 1;
      interpX = from.x + (to.x - from.x) * t;
      interpY = from.y + (to.y - from.y) * t;
      snap = to;
    } else if (fromIdx >= 0) {
      // renderTime past newest snapshot — hold at last known position
      snap = buf[fromIdx];
      interpX = snap.x;
      interpY = snap.y;
    } else {
      // renderTime before oldest snapshot — snap to oldest
      snap = buf[toIdx];
      interpX = snap.x;
      interpY = snap.y;
    }

    // Save prev BEFORE updating position
    this.prevX = this.x;
    this.prevY = this.y;

    this.worldX = interpX;
    this.worldY = interpY;
    this.syncLocalFromWorld();

    this.direction = FACING_TO_DIR[snap.facing] ?? 0;
    this.moving = snap.vx !== 0 || snap.vy !== 0;

    // Prune consumed snapshots (keep fromIdx as oldest needed)
    if (fromIdx > 0) {
      this.snapshotBuffer.splice(0, fromIdx);
    }
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

    if (
      DEBUG_FLAGS.NET_ENABLE_CLIENT_PREDICTION &&
      DEBUG_FLAGS.NET_ENABLE_RECONCILIATION
    ) {
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
