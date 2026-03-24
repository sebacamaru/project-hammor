import { Graphics, AnimatedSprite, Assets } from "pixi.js";
import { sliceSpriteSheet } from "../../shared/assets/SpriteSheetSlicer.js";
import { PLAYER_ANIMATIONS } from "../../shared/data/models/PlayerAnimations.js";

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
 * Maps direction string to the idle animation key in PLAYER_ANIMATIONS.
 * Entity sheets share the same row layout as the player sheet.
 */
const _IDLE_ANIM = {
  down:  "idle_down",
  left:  "idle_left",
  right: "idle_right",
  up:    "idle_up",
};

/**
 * Builds the frame-cache key from a visual component.
 * Keyed by sheet + frame dimensions to prevent reuse across different slicings.
 * @param {object} v - Visual component ({ sheet, frameWidth, frameHeight }).
 * @returns {string}
 */
const _sliceKey = (v) => `${v.sheet}|${v.frameWidth ?? 16}|${v.frameHeight ?? 16}`;

/**
 * Module-level frame cache shared across all RemoteEntityView instances.
 * Avoids re-slicing the same sheet+size combo for each entity.
 * @type {Map<string, import("pixi.js").Texture[][]>}
 */
const _FRAME_CACHE = new Map();

/**
 * Visual representation of a non-player entity received from snapshots.
 * Renders a real character sprite when `entity.visual` data is present,
 * or falls back to a kind-based colored 16×16 placeholder otherwise.
 * Position follows the feet convention (same offset as PlayerView).
 */
export class RemoteEntityView {
  /**
   * @param {import("pixi.js").Container} parentContainer - The entity layer to add this view to.
   * @param {string} kind - Entity kind for placeholder color selection.
   */
  constructor(parentContainer, kind, hasVisual) {
    /** @type {import("pixi.js").Container} */
    this._parent = parentContainer;

    /** @type {Graphics|null} Colored rect fallback — only created when entity has visual data (used while sprite loads). */
    this._rect = hasVisual ? this._createPlaceholder(kind) : null;
    if (this._rect) this._parent.addChild(this._rect);

    /** @type {import("pixi.js").Sprite|null} Real character sprite, null until async load completes. */
    this._sprite = null;

    /** @type {string|null} The slice key of the sheet currently loaded (sheet|fw|fh). */
    this._loadedKey = null;

    /** @type {string|null} The idle animation key currently playing (e.g. "idle_down"). */
    this._currentAnim = null;

    /** @type {number} Incremented on each _loadSprite() call — stale async loads abort. */
    this._loadVersion = 0;

    /** @type {boolean} Set on destroy() to abort any in-flight async load. */
    this._destroyed = false;
  }

  /**
   * Updates the view position from entity world-space coordinates.
   * Triggers a sprite load when visual data is present and the sheet/size has changed.
   * Applies a texture-only update when only direction/pattern changed.
   * @param {import('./RemoteEntity.js').RemoteEntity} entity
   */
  updateFromEntity(entity) {
    const ex = Math.round(entity.x);
    const ey = Math.round(entity.y);

    // Keep rect in sync (fallback while sprite loads)
    if (this._rect) {
      this._rect.x = ex - 8;
      this._rect.y = ey - 16;
      this._rect.zIndex = ey;
    }

    const v = entity.visual;
    if (v?.type === "character" && v.sheet) {
      const key = _sliceKey(v);
      if (key !== this._loadedKey) {
        // Sheet or frame size changed — full async reload
        this._loadSprite(v, entity.x, entity.y);
      } else if (this._sprite) {
        // Sheet same — update animation if direction changed
        this._playIdle(v.direction ?? "down");
      }
    }

    if (this._sprite) {
      const fw = v?.frameWidth ?? 16;
      const fh = v?.frameHeight ?? 16;
      this._positionSprite(this._sprite, entity.x, entity.y, fw, fh);
    }
  }

  /**
   * Removes all visuals from the scene and cleans up resources.
   * Marks the view as destroyed to abort any in-flight sprite load.
   */
  destroy() {
    this._destroyed = true;

    if (this._rect) {
      if (this._rect.parent) this._rect.parent.removeChild(this._rect);
      this._rect.destroy();
      this._rect = null;
    }

    if (this._sprite) {
      if (this._sprite.parent) this._sprite.parent.removeChild(this._sprite);
      this._sprite.destroy();
      this._sprite = null;
    }

    this._parent = null;
  }

  /**
   * Positions a sprite using the feet convention (center-bottom anchor).
   * @param {import("pixi.js").Sprite} sprite
   * @param {number} x - World feet X
   * @param {number} y - World feet Y
   * @param {number} fw - Frame width in pixels
   * @param {number} fh - Frame height in pixels
   */
  _positionSprite(sprite, x, y, fw, fh) {
    sprite.x = Math.round(x - fw / 2);
    sprite.y = Math.round(y - fh);
    sprite.zIndex = Math.round(y);
  }

  /**
   * Async sprite loader. Fetches the sheet via manifest alias, slices frames,
   * caches the result module-wide, then creates or replaces this._sprite as
   * an AnimatedSprite playing the idle animation for the given direction.
   * Race guard: any load superseded by a newer call is silently abandoned.
   * @param {object} visual - Visual component data.
   */
  async _loadSprite(visual, spawnX, spawnY) {
    const version = ++this._loadVersion;
    this._loadedKey = _sliceKey(visual);

    const fw = visual.frameWidth ?? 16;
    const fh = visual.frameHeight ?? 16;
    const key = this._loadedKey;

    if (!_FRAME_CACHE.has(key)) {
      try {
        const tex = await Assets.load(visual.sheet);
        if (this._destroyed || version !== this._loadVersion) return;
        const cols = Math.floor(tex.width / fw);
        const rows = Math.floor(tex.height / fh);
        _FRAME_CACHE.set(key, sliceSpriteSheet(tex, fw, fh, cols, rows));
      } catch (err) {
        console.warn(`[RemoteEntityView] Failed to load sheet "${visual.sheet}":`, err);
        return;
      }
    }

    if (this._destroyed || version !== this._loadVersion) return;

    const animKey = _IDLE_ANIM[visual.direction ?? "down"] ?? "idle_down";
    const config = PLAYER_ANIMATIONS[animKey];
    const frames = _FRAME_CACHE.get(key);
    const textures = frames?.[config.row];
    if (!textures?.length) return;

    if (this._sprite) {
      this._sprite.destroy();
      this._sprite = null;
    }

    this._sprite = new AnimatedSprite(textures);
    this._sprite.animationSpeed = config.speed;
    this._sprite.play();
    this._currentAnim = animKey;
    this._positionSprite(this._sprite, spawnX, spawnY, fw, fh);
    this._parent.addChild(this._sprite);

    if (this._rect) this._rect.visible = false;
  }

  /**
   * Switches the AnimatedSprite to the idle animation for the given direction.
   * No-ops if the direction hasn't changed.
   * @param {string} direction - "down" | "left" | "right" | "up"
   */
  _playIdle(direction) {
    const animKey = _IDLE_ANIM[direction] ?? "idle_down";
    if (this._currentAnim === animKey) return;

    const config = PLAYER_ANIMATIONS[animKey];
    const frames = _FRAME_CACHE.get(this._loadedKey);
    const textures = frames?.[config.row];
    if (!textures?.length) return;

    this._sprite.textures = textures;
    this._sprite.animationSpeed = config.speed;
    this._sprite.play();
    this._currentAnim = animKey;
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
