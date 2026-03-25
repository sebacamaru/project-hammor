const SNAP_THRESHOLD = 64;
const SNAP_EPSILON = 0.5;
const LERP_FACTOR = 0.03;

/**
 * Client-side data model for a non-player entity received from server snapshots.
 * Authoritative position (x, y) comes from snapshots.
 * Render position (renderX, renderY) smoothly interpolates toward it.
 */
export class RemoteEntity {
  /**
   * @param {object} data - Initial snapshot data from server.
   */
  constructor(data) {
    /** @type {string} Runtime id assigned by server (e.g. "e1"). */
    this.id = data.id;
    /** @type {string} Stable authored id from map JSON (for debugging/future interactions). */
    this.authoredId = data.authoredId;
    /** @type {string} Entity type (e.g. "npc", "object", "sign"). */
    this.kind = data.kind;
    /** @type {number} Authoritative world-space x position in pixels (feet convention). */
    this.x = data.x;
    /** @type {number} Authoritative world-space y position in pixels (feet convention). */
    this.y = data.y;
    /** @type {number} Visual x position for rendering (interpolated toward x). */
    this.renderX = data.x;
    /** @type {number} Visual y position for rendering (interpolated toward y). */
    this.renderY = data.y;
    /** @type {object|null} Sprite component data (sheet, animation, frame) or null. */
    this.sprite = data.sprite ?? null;
    /** @type {boolean} Whether this entity can be interacted with. */
    this.interactable = data.interactable ?? false;
    /** @type {boolean} Whether this entity blocks player movement. */
    this.solid = data.solid ?? false;
    /** @type {object|null} Collision hitbox for solid entities ({ offsetX, offsetY, width, height }). */
    this.hitbox = data.hitbox ?? null;
    /** @type {object|null} Visual component data (type, sheet, frameWidth, frameHeight, direction, pattern) or null. */
    this.visual = data.visual ?? null;
  }

  /**
   * Updates this entity's authoritative state from a server snapshot.
   * Snaps render position if the correction is very large.
   * @param {object} data - Snapshot data from server.
   */
  applySnapshot(data) {
    this.x = data.x;
    this.y = data.y;
    this.sprite = data.sprite ?? null;
    this.interactable = data.interactable ?? false;
    this.solid = data.solid ?? false;
    this.hitbox = data.hitbox ?? null;
    this.visual = data.visual ?? null;

    // Snap render position if the correction is very large
    if (
      Math.hypot(data.x - this.renderX, data.y - this.renderY) > SNAP_THRESHOLD
    ) {
      this.renderX = data.x;
      this.renderY = data.y;
    }
  }

  /**
   * Interpolates render position toward authoritative position.
   * Snaps cleanly when close enough. Call once per render frame.
   */
  updateRenderPosition() {
    const dx = this.x - this.renderX;
    const dy = this.y - this.renderY;
    if (Math.hypot(dx, dy) < SNAP_EPSILON) {
      this.renderX = this.x;
      this.renderY = this.y;
    } else {
      this.renderX += dx * LERP_FACTOR;
      this.renderY += dy * LERP_FACTOR;
    }
  }

  /**
   * Returns whether the entity is visually moving (render position hasn't reached target).
   * @returns {boolean}
   */
  isMoving() {
    return (
      Math.hypot(this.x - this.renderX, this.y - this.renderY) >= SNAP_EPSILON
    );
  }
}
