import { Container, Sprite, Texture } from "pixi.js";

/**
 * Overlay that renders soft radial glow halos for each enabled point light
 * when Lights mode is active in the map editor.
 *
 * Redraws only when data changes via setLights/setDragPreview/clearDragPreview — never per-frame.
 */
export class LightPreviewOverlay {
  constructor() {
    this.container = new Container();

    /** @type {Array<object>} */
    this._lights = [];

    /** @type {Map<string, Sprite>} */
    this._spritesById = new Map();

    /** @type {{ lightId: string, x: number, y: number }|null} */
    this._dragPreview = null;

    /** @type {Texture|null} Lazily created radial gradient texture. */
    this._glowTexture = null;
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
   * Returns the shared radial gradient texture, creating it on first call.
   * White center fading to transparent edge, 128x128.
   * @returns {Texture}
   */
  _getGlowTexture() {
    if (this._glowTexture) return this._glowTexture;

    const size = 128;
    const half = size / 2;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    this._glowTexture = Texture.from(canvas);
    return this._glowTexture;
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

  /**
   * Full rebuild — diffs sprites by light id, creates/updates/removes as needed.
   */
  _rebuild() {
    const tex = this._getGlowTexture();
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

      const alpha = Math.max(0, Math.min(light.intensity * 0.35, 0.85));
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
      sprite.width = radius * 2;
      sprite.height = radius * 2;
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

  /** Cleans up all resources. */
  destroy() {
    for (const sprite of this._spritesById.values()) {
      sprite.destroy();
    }
    this._spritesById.clear();

    if (this._glowTexture) {
      this._glowTexture.destroy(true);
      this._glowTexture = null;
    }

    this.container.destroy({ children: true });
  }
}
