import { Graphics } from "pixi.js";

/**
 * Color-coded placeholder colors by entity kind.
 * Helps distinguish entity types visually during testing.
 */
const KIND_COLORS = {
  npc: 0x00cccc,      // cyan
  object: 0xcccc00,   // yellow
  sign: 0xcccc00,     // yellow (same as object)
};
const DEFAULT_COLOR = 0xcc00cc; // magenta

/**
 * Visual representation of a non-player entity received from snapshots.
 * Uses kind-based colored 16×16 placeholders for Phase 2.
 * Position follows the feet convention (same offset as PlayerView).
 */
export class RemoteEntityView {
  /**
   * @param {import("pixi.js").Container} parentContainer - The entity layer to add this view to.
   * @param {string} kind - Entity kind for placeholder color selection.
   */
  constructor(parentContainer, kind) {
    this.parent = parentContainer;
    this.sprite = this._createPlaceholder(kind);
    this.parent.addChild(this.sprite);
  }

  /**
   * Updates the sprite position from entity world-space coordinates.
   * Uses the feet convention: sprite drawn at (x - 8, y - 16).
   * @param {import('./RemoteEntity.js').RemoteEntity} entity
   */
  updateFromEntity(entity) {
    this.sprite.x = Math.round(entity.x) - 8;
    this.sprite.y = Math.round(entity.y) - 16;
  }

  /**
   * Removes the sprite from the scene and cleans up resources.
   */
  destroy() {
    if (this.sprite) {
      if (this.sprite.parent) {
        this.sprite.parent.removeChild(this.sprite);
      }
      this.sprite.destroy();
      this.sprite = null;
    }
    this.parent = null;
  }

  /**
   * Creates a 16×16 colored rectangle placeholder based on entity kind.
   * @param {string} kind - Entity kind.
   * @returns {Graphics}
   */
  _createPlaceholder(kind) {
    const color = KIND_COLORS[kind] ?? DEFAULT_COLOR;
    const g = new Graphics();
    g.rect(0, 0, 16, 16);
    g.fill(color);
    return g;
  }
}
