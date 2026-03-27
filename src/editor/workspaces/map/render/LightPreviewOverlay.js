import { Container, Sprite, Texture } from "pixi.js";

/** @type {Texture|null} Shared radial gradient texture (module-level singleton). */
let _radialTexture = null;

/**
 * Returns a shared 128×128 white radial gradient texture.
 * Created once on first call, cached for all subsequent uses.
 * Color is applied per-sprite via `sprite.tint`.
 * @returns {Texture}
 */
function getRadialTexture() {
  if (_radialTexture) return _radialTexture;

  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2,
  );
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  _radialTexture = Texture.from(canvas);
  return _radialTexture;
}

/**
 * Overlay that renders soft radial halo sprites for each enabled light,
 * using additive blending. Positioned between the ambient overlay and
 * entity overlays so lights preview map illumination without washing
 * out editor affordances.
 *
 * Redraws only when data changes via setLights/setDragPreview/clearDragPreview — never per-frame.
 */
export class LightPreviewOverlay {
  constructor() {
    this.container = new Container();

    /** @type {Array<object>} */
    this._lights = [];

    /** @type {Map<string, Sprite>} Cached halo sprites keyed by light id. */
    this._spritesById = new Map();

    /** @type {{ lightId: string, x: number, y: number }|null} */
    this._dragPreview = null;
  }

  /**
   * Replaces the lights array and redraws.
   * @param {Array<object>} lights
   */
  setLights(lights) {
    this._lights = Array.isArray(lights) ? lights : [];
    this._rebuild();
  }

  /**
   * Sets a transient drag preview position for a light and redraws.
   * @param {string} lightId
   * @param {number} x
   * @param {number} y
   */
  setDragPreview(lightId, x, y) {
    this._dragPreview = { lightId, x, y };
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
   * Full rebuild — diffs sprites by light id, creates/updates/removes as needed.
   */
  _rebuild() {
    const tex = getRadialTexture();
    const activeIds = new Set();

    for (const light of this._lights) {
      const id = light.id;
      if (!id) continue;

      // Skip disabled or zero-radius lights
      if (light.enabled === false || (light.radius ?? 96) <= 0) {
        const existing = this._spritesById.get(id);
        if (existing) existing.visible = false;
        activeIds.add(id);
        continue;
      }

      const alpha = Math.max(0, Math.min((light.intensity ?? 1) * 0.35, 0.85));
      if (alpha <= 0) {
        const existing = this._spritesById.get(id);
        if (existing) existing.visible = false;
        activeIds.add(id);
        continue;
      }

      // Resolve position (drag preview overrides authored)
      let x = light.x;
      let y = light.y;
      if (x == null || y == null) continue;

      if (this._dragPreview?.lightId === id) {
        x = this._dragPreview.x;
        y = this._dragPreview.y;
      }

      const radius = light.radius ?? 96;

      // Get or create sprite
      let sprite = this._spritesById.get(id);
      if (!sprite) {
        sprite = new Sprite(tex);
        sprite.anchor.set(0.5);
        sprite.blendMode = "add";
        this._spritesById.set(id, sprite);
        this.container.addChild(sprite);
      }

      sprite.x = x;
      sprite.y = y;
      sprite.width = Math.max(1, radius * 2);
      sprite.height = Math.max(1, radius * 2);
      sprite.tint = this._parseColor(light.color);
      sprite.alpha = alpha;
      sprite.visible = true;

      activeIds.add(id);
    }

    // Remove sprites for lights that no longer exist
    for (const [id, sprite] of this._spritesById) {
      if (!activeIds.has(id)) {
        this.container.removeChild(sprite);
        sprite.destroy();
        this._spritesById.delete(id);
      }
    }
  }

  /**
   * Parses a hex color string to a numeric value.
   * @param {string} color
   * @returns {number}
   */
  _parseColor(color) {
    if (typeof color === "string" && color.startsWith("#")) {
      return parseInt(color.slice(1), 16);
    }
    return 0xffffff;
  }

  /** Cleans up all resources. */
  destroy() {
    for (const sprite of this._spritesById.values()) {
      sprite.destroy();
    }
    this._spritesById.clear();

    this.container.destroy({ children: true });
  }
}
