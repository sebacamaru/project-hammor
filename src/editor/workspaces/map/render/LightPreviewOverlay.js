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
 * Redraws only when data changes via setLights/setDragPreview — never per-frame.
 */
export class LightPreviewOverlay {
  constructor() {
    this.container = new Container();

    /** @type {Array<object>} */
    this._lights = [];

    /** @type {Sprite[]} Cached halo sprites. */
    this._sprites = [];

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
   * Full rebuild — destroys all sprites and recreates halos for enabled lights.
   */
  _rebuild() {
    this._destroySprites();

    for (const light of this._lights) {
      if (light.enabled === false) continue;
      this._addHalo(light);
    }
  }

  /**
   * Creates a halo sprite for a single light and adds it to the container.
   * @param {object} light
   */
  _addHalo(light) {
    let x = light.x;
    let y = light.y;
    if (x == null || y == null) return;

    // Use drag preview position if this light is being dragged
    if (this._dragPreview?.lightId === light.id) {
      x = this._dragPreview.x;
      y = this._dragPreview.y;
    }

    const radius = light.radius ?? 96;
    if (radius <= 0) return;

    const sprite = new Sprite(getRadialTexture());
    sprite.anchor.set(0.5);
    sprite.x = x;
    sprite.y = y;
    sprite.width = Math.max(1, radius * 2);
    sprite.height = Math.max(1, radius * 2);
    sprite.tint = this._parseColor(light.color);
    sprite.alpha = Math.max(0, Math.min(0.85, (light.intensity ?? 1) * 0.35));
    sprite.blendMode = "add";

    this.container.addChild(sprite);
    this._sprites.push(sprite);
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

  /** Removes and destroys all halo sprites from the container. */
  _destroySprites() {
    for (const sprite of this._sprites) {
      this.container.removeChild(sprite);
      sprite.destroy();
    }
    this._sprites.length = 0;
  }

  /** Cleans up all resources. */
  destroy() {
    this._destroySprites();
    this.container.destroy({ children: true });
  }
}
