import { Container, Graphics, Text } from "pixi.js";

/**
 * Read-only overlay that draws entity markers (sprite rect, hitbox, feet, label)
 * when the Events tab is active in the map editor.
 *
 * Redraws only when {@link setEntities} is called — never per-frame.
 */
export class EntityOverlay {
  constructor() {
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);

    /** @type {Array<object>} */
    this.entities = [];

    /** @type {Text[]} Cached label Text objects. */
    this._labels = [];

    /** @type {string|null} ID of the currently selected entity, or null. */
    this._selectedEntityId = null;

    /** @type {{ entityId: string, x: number, y: number }|null} Transient drag preview position. */
    this._dragPreview = null;
  }

  /**
   * Sets the selected entity by id and redraws the overlay.
   * Pass null to deselect. No-ops if the id has not changed.
   * @param {string|null} id
   */
  setSelectedEntityId(id) {
    const next = id ?? null;
    if (this._selectedEntityId === next) return;
    this._selectedEntityId = next;
    this._rebuild();
  }

  /**
   * Sets a temporary drag preview position for the given entity and redraws.
   * @param {string} entityId
   * @param {number} x
   * @param {number} y
   */
  setDragPreview(entityId, x, y) {
    this._dragPreview = { entityId, x, y };
    this._rebuild();
  }

  /**
   * Clears the drag preview and redraws.
   */
  clearDragPreview() {
    if (this._dragPreview === null) return;
    this._dragPreview = null;
    this._rebuild();
  }

  /**
   * Replaces the entity set and immediately redraws the overlay.
   * @param {Array<object>} entities
   */
  setEntities(entities) {
    this.entities = Array.isArray(entities) ? entities : [];
    this._rebuild();
  }

  /**
   * Full rebuild — clears graphics and recreates all visuals.
   * Only called from {@link setEntities}, never per-frame.
   */
  _rebuild() {
    this.graphics.clear();
    this._destroyLabels();

    for (const entity of this.entities) {
      this._drawEntity(entity);
    }
  }

  /**
   * Draws a single entity marker: sprite rect, optional hitbox, feet dot, label.
   * @param {object} entity
   */
  _drawEntity(entity) {
    let x = entity.x;
    let y = entity.y;
    if (x == null || y == null) return;

    // Use drag preview position if this entity is being dragged
    if (this._dragPreview?.entityId === entity.id) {
      x = this._dragPreview.x;
      y = this._dragPreview.y;
    }

    const color = this._getKindColor(entity.kind, entity.prefabId);
    const isSelected = this._selectedEntityId != null && entity.id === this._selectedEntityId;

    // --- Sprite rectangle (16×16, offset from feet) ---
    const spriteX = x - 8;
    const spriteY = y - 16;
    this.graphics.rect(spriteX, spriteY, 16, 16);
    this.graphics.fill({ color, alpha: isSelected ? 0.5 : 0.3 });
    this.graphics.rect(spriteX, spriteY, 16, 16);
    this.graphics.stroke({ color, alpha: 1, width: isSelected ? 2 : 1, pixelLine: !isSelected });

    // --- Selection ring (white outer outline) ---
    if (isSelected) {
      this.graphics.rect(spriteX - 1, spriteY - 1, 18, 18);
      this.graphics.stroke({ color: 0xffffff, alpha: 0.9, width: 1, pixelLine: true });
    }

    // --- Hitbox outline (collision component) ---
    const collision = entity.components?.collision;
    if (collision?.hitbox) {
      const hb = collision.hitbox;
      const hx = x + (hb.offsetX ?? 0);
      const hy = y + (hb.offsetY ?? 0);
      const hw = hb.width ?? 0;
      const hh = hb.height ?? 0;
      if (hw > 0 && hh > 0) {
        this.graphics.rect(hx, hy, hw, hh);
        this.graphics.stroke({ color: 0xff4444, alpha: 0.7, width: 1, pixelLine: true });
      }
    }

    // --- Feet marker (small dot) ---
    this.graphics.rect(x - 1, y - 1, 2, 2);
    this.graphics.fill({ color: 0xffffff, alpha: 0.85 });

    // --- Label ---
    const labelText = entity.id ?? "";
    if (labelText) {
      const label = new Text({
        text: labelText,
        style: {
          fontSize: 11,
          fill: 0xffffff,
          fontFamily: "monospace",
          dropShadow: {
            color: 0x000000,
            alpha: 0.8,
            blur: 0,
            distance: 1,
          },
        },
        resolution: 2,
      });
      label.anchor.set(0.5, 1);
      label.x = x;
      label.y = spriteY - 2;
      this.container.addChild(label);
      this._labels.push(label);
    }
  }

  /**
   * Returns a color for the entity based on its kind, matching runtime conventions.
   * @param {string|undefined} kind
   * @param {string|undefined} prefabId
   * @returns {number}
   */
  _getKindColor(kind, prefabId) {
    if (kind === "npc") return 0x00ffff;
    if (kind === "object") return 0xffff00;
    // Infer kind from prefabId prefix when kind is absent
    if (!kind && prefabId) {
      if (prefabId.startsWith("npc_")) return 0x00ffff;
      if (prefabId.startsWith("obj_")) return 0xffff00;
    }
    return 0xff00ff;
  }

  /** Removes all Text label objects from the container. */
  _destroyLabels() {
    for (const label of this._labels) {
      this.container.removeChild(label);
      label.destroy();
    }
    this._labels.length = 0;
  }

  destroy() {
    this._destroyLabels();
    this.graphics.destroy();
    this.container.destroy({ children: true });
  }
}
