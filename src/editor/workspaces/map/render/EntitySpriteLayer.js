import { Container, Sprite, Assets } from "pixi.js";
import { sliceSpriteSheet } from "../../../../shared/assets/SpriteSheetSlicer.js";
import { PLAYER_ANIMATIONS } from "../../../../shared/data/models/PlayerAnimations.js";

/**
 * Maps direction string to the row index of the idle animation for that direction.
 * Derived from PLAYER_ANIMATIONS so entity sheets share the same layout as the player sheet.
 */
const DIRECTION_ROW = {
  down:  PLAYER_ANIMATIONS["idle_down"].row,
  left:  PLAYER_ANIMATIONS["idle_left"].row,
  right: PLAYER_ANIMATIONS["idle_right"].row,
  up:    PLAYER_ANIMATIONS["idle_up"].row,
};

/**
 * Renders a static sprite frame for each entity that has
 * `components.visual.type === "character"`.
 *
 * Sits below EntityOverlay so debug/selection markers always render on top.
 * Only entities with a valid visual component get a sprite — others are ignored.
 *
 * Sprite anchor follows the project feet convention:
 *   sprite.x = x - frameWidth  / 2
 *   sprite.y = y - frameHeight
 */
export class EntitySpriteLayer {
  constructor() {
    /** @type {Container} Root container — add to scene below EntityOverlay. */
    this.container = new Container();

    /** @type {Map<string, import("pixi.js").Sprite>} entityId → Sprite */
    this._sprites = new Map();

    /** @type {Map<string, import("pixi.js").Texture[][]>} `alias:WxH` → sliced frames */
    this._frameCache = new Map();

    /**
     * Incremented on every _sync() call.
     * Async texture loads compare against this to detect stale results.
     * @type {number}
     */
    this._syncVersion = 0;

    /** @type {Array<object>} Current entity array. */
    this._entities = [];

    /** @type {{ entityId: string, x: number, y: number }|null} */
    this._dragPreview = null;
  }

  /**
   * Replaces the entity set and re-syncs all sprites.
   * @param {Array<object>} entities
   */
  setEntities(entities) {
    this._entities = Array.isArray(entities) ? [...entities] : [];
    this._sync();
  }

  /**
   * Sets a temporary drag preview position for the given entity.
   * Updates sprite position without touching the entity data.
   * @param {string} entityId
   * @param {number} x
   * @param {number} y
   */
  setDragPreview(entityId, x, y) {
    this._dragPreview = { entityId, x, y };
    this._applyPositions();
  }

  /**
   * Clears the drag preview and restores entity position.
   */
  clearDragPreview() {
    if (!this._dragPreview) return;
    this._dragPreview = null;
    this._applyPositions();
  }

  /**
   * Async sync — loads textures, creates/updates/removes sprites.
   * Race guard: each invocation stamps a version; stale async loads abort
   * before mutating any state.
   */
  async _sync() {
    const version = ++this._syncVersion;
    const activeIds = new Set();

    for (const entity of this._entities) {
      const v = entity.components?.visual;
      if (v?.type !== "character" || !v.sheet) continue;

      activeIds.add(entity.id);

      const fw = v.frameWidth ?? 16;
      const fh = v.frameHeight ?? 16;

      const frames = await this._getFrames(v.sheet, fw, fh);
      if (version !== this._syncVersion) return; // stale — a newer _sync() superseded us
      if (!frames) continue;

      const row = DIRECTION_ROW[v.direction] ?? 0;
      const col = v.pattern ?? 1;
      const texture = frames[row]?.[col];
      if (!texture) continue;

      let sprite = this._sprites.get(entity.id);
      if (!sprite) {
        sprite = new Sprite(texture);
        this.container.addChild(sprite);
        this._sprites.set(entity.id, sprite);
      } else {
        sprite.texture = texture;
      }

      const x = this._dragPreview?.entityId === entity.id ? this._dragPreview.x : entity.x;
      const y = this._dragPreview?.entityId === entity.id ? this._dragPreview.y : entity.y;
      this._positionSprite(sprite, x, y, fw, fh);
    }

    if (version !== this._syncVersion) return;

    // Remove sprites for entities no longer present or without a visual component
    for (const [id, sprite] of this._sprites) {
      if (!activeIds.has(id)) {
        this.container.removeChild(sprite);
        sprite.destroy();
        this._sprites.delete(id);
      }
    }
  }

  /**
   * Repositions all existing sprites, applying drag preview where applicable.
   * Called on drag preview changes without re-loading textures.
   */
  _applyPositions() {
    for (const entity of this._entities) {
      const sprite = this._sprites.get(entity.id);
      if (!sprite) continue;
      const v = entity.components?.visual;
      const fw = v?.frameWidth ?? 16;
      const fh = v?.frameHeight ?? 16;
      const x = this._dragPreview?.entityId === entity.id ? this._dragPreview.x : entity.x;
      const y = this._dragPreview?.entityId === entity.id ? this._dragPreview.y : entity.y;
      this._positionSprite(sprite, x, y, fw, fh);
    }
  }

  /**
   * Positions a sprite using the feet convention (center-bottom anchor).
   * @param {import("pixi.js").Sprite} sprite
   * @param {number} x - World feet X
   * @param {number} y - World feet Y
   * @param {number} frameWidth
   * @param {number} frameHeight
   */
  _positionSprite(sprite, x, y, frameWidth, frameHeight) {
    sprite.x = Math.round(x - frameWidth / 2);
    sprite.y = Math.round(y - frameHeight);
  }

  /**
   * Lazily loads and caches sliced frame arrays for a given sheet alias.
   * Uses manifest alias (e.g. "npc_01") — resolved via PixiJS Assets.
   * @param {string} sheet - Asset alias registered in AssetManifest.js
   * @param {number} frameWidth
   * @param {number} frameHeight
   * @returns {Promise<import("pixi.js").Texture[][]|null>}
   */
  async _getFrames(sheet, frameWidth, frameHeight) {
    const key = `${sheet}:${frameWidth}x${frameHeight}`;
    if (this._frameCache.has(key)) return this._frameCache.get(key);
    try {
      const texture = await Assets.load(sheet);
      if (!texture) return null;
      const cols = Math.floor(texture.width / frameWidth);
      const rows = Math.floor(texture.height / frameHeight);
      const frames = sliceSpriteSheet(texture, frameWidth, frameHeight, cols, rows);
      this._frameCache.set(key, frames);
      return frames;
    } catch (err) {
      console.warn(`[EntitySpriteLayer] Failed to load sheet "${sheet}":`, err);
      return null;
    }
  }

  /** Destroys all sprites, clears caches, and destroys the container. */
  destroy() {
    for (const sprite of this._sprites.values()) {
      sprite.destroy();
    }
    this._sprites.clear();
    this._frameCache.clear();
    this.container.destroy({ children: true });
  }
}
