/**
 * Client-side data model for a non-player entity received from server snapshots.
 * No interpolation, no prediction — static entities snap to position.
 * Keeps symmetry with the remote player model pattern.
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
    /** @type {number} World-space x position in pixels (feet convention). */
    this.x = data.x;
    /** @type {number} World-space y position in pixels (feet convention). */
    this.y = data.y;
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
   * Updates this entity's state from a server snapshot.
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
  }
}
