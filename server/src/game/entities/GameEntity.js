/**
 * Server-side runtime entity created from authored map data.
 * Pure data holder — no rendering, no behavior, no PixiJS.
 * Coordinates use the same pixel/feet convention as ServerPlayer.
 */
export class GameEntity {
  /**
   * @param {string} runtimeId - Server-assigned id (e.g. "e1").
   * @param {string} authoredId - Stable id from the map JSON instance.
   * @param {string} mapId - The map this entity belongs to.
   * @param {string} kind - Entity type (e.g. "npc", "object", "sign", "trigger").
   * @param {number} x - Position in pixels, map-local (feet convention).
   * @param {number} y - Position in pixels, map-local (feet convention).
   * @param {object} params - Merged loose instance-specific values.
   * @param {object} components - Merged structured capability/config blocks.
   */
  constructor(runtimeId, authoredId, mapId, kind, x, y, params, components) {
    this.runtimeId = runtimeId;
    this.authoredId = authoredId;
    this.mapId = mapId;
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.params = params;
    this.components = components;
  }

  /**
   * Returns the minimal data needed by clients for rendering and interaction hints.
   * Derived network payload — not the canonical runtime shape.
   * Position is map-local; caller converts to world-space before sending.
   * @returns {{ id: string, authoredId: string, kind: string, x: number, y: number, sprite?: object, interactable?: boolean }}
   */
  toSnapshotData() {
    const data = {
      id: this.runtimeId,
      authoredId: this.authoredId,
      kind: this.kind,
      x: this.x,
      y: this.y,
    };
    if (this.components.sprite) {
      data.sprite = this.components.sprite;
    }
    if (this.components.interaction) {
      data.interactable = true;
    }
    if (this.components.collision?.solid && this.components.collision.hitbox) {
      data.solid = true;
      data.hitbox = this.components.collision.hitbox;
    }
    if (this.components.visual) {
      data.visual = this.components.visual;
    }
    return data;
  }

  /**
   * Returns debug hitbox data for this entity, or null if not solid.
   * Used to build debugEntityHitboxes in snapshots — separate from the clean snapshot payload.
   * Position is map-local; caller converts to world-space before sending.
   * @returns {{ id: string, x: number, y: number, hitbox: object }|null}
   */
  toDebugHitboxData() {
    const col = this.components.collision;
    if (!col?.solid || !col.hitbox) return null;
    return { id: this.runtimeId, x: this.x, y: this.y, hitbox: col.hitbox };
  }

  /**
   * Returns a plain object for logging and debug inspection.
   * This is NOT a network/snapshot format.
   * @returns {object}
   */
  toDebugData() {
    return {
      runtimeId: this.runtimeId,
      authoredId: this.authoredId,
      mapId: this.mapId,
      kind: this.kind,
      x: this.x,
      y: this.y,
      params: this.params,
      components: this.components,
    };
  }
}
