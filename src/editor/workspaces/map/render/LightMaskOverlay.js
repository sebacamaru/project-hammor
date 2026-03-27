import { Container, Graphics, RenderTexture, Sprite, Texture } from "pixi.js";

/**
 * Overlay that renders a darkness layer with soft radial holes for lights
 * that have `visibility: true`. Uses a RenderTexture with erase blend mode
 * to punch transparent holes in an opaque black surface.
 *
 * Only re-renders when lights change (dirty flag).
 */
export class LightMaskOverlay {
  constructor() {
    /** Container added to the scene tree — holds the display sprite. */
    this.container = new Container();

    /** @type {Sprite|null} Displays the RenderTexture result. */
    this._displaySprite = null;

    /** @type {Container} Off-screen container rendered to RT. */
    this._stagingContainer = new Container();

    /** @type {Graphics} Black rectangle filling the map. */
    this._darkGraphics = new Graphics();
    this._stagingContainer.addChild(this._darkGraphics);

    /** @type {Map<string, Sprite>} Erase sprites keyed by light id. */
    this._lightSprites = new Map();

    /** @type {RenderTexture|null} */
    this._renderTexture = null;

    /** @type {Texture|null} Lazily created radial gradient texture. */
    this._glowTexture = null;

    /** @type {Array<object>} Current lights array. */
    this._lights = [];

    /** @type {{ lightId: string, x: number, y: number }|null} */
    this._dragPreview = null;

    /** @type {boolean} Whether the RT needs re-rendering. */
    this._dirty = false;

    /** @type {number} Current map width in pixels. */
    this._mapW = 0;

    /** @type {number} Current map height in pixels. */
    this._mapH = 0;
  }

  /**
   * Sets the map dimensions and creates/resizes the RenderTexture.
   * @param {number} w - Map width in pixels.
   * @param {number} h - Map height in pixels.
   */
  setMapSize(w, h) {
    if (w <= 0 || h <= 0) return;
    this._mapW = w;
    this._mapH = h;

    // Recreate RenderTexture at exact map size
    if (this._renderTexture) {
      this._renderTexture.destroy(true);
    }
    this._renderTexture = RenderTexture.create({ width: w, height: h });

    // Rebuild dark rect
    this._darkGraphics.clear();
    this._darkGraphics.rect(0, 0, w, h);
    this._darkGraphics.fill({ color: 0x000000, alpha: 1 });

    // Rebuild display sprite
    if (this._displaySprite) {
      this.container.removeChild(this._displaySprite);
      this._displaySprite.destroy();
    }
    this._displaySprite = new Sprite(this._renderTexture);
    this._displaySprite.x = 0;
    this._displaySprite.y = 0;
    this.container.addChild(this._displaySprite);

    this._dirty = true;
  }

  /**
   * Replaces the lights array and rebuilds erase sprites.
   * @param {Array<object>} lights
   */
  setLights(lights) {
    this._lights = Array.isArray(lights) ? lights : [];
    this._rebuildSprites();
  }

  /**
   * Sets a transient drag preview position for a light.
   * @param {string} lightId
   * @param {number} x
   * @param {number} y
   */
  setDragPreview(lightId, x, y) {
    this._dragPreview = { lightId, x, y };
    this._rebuildSprites();
  }

  /**
   * Clears the drag preview.
   */
  clearDragPreview() {
    if (this._dragPreview === null) return;
    this._dragPreview = null;
    this._rebuildSprites();
  }

  /**
   * Renders the staging container to the RenderTexture if dirty.
   * Must be called with the actual Pixi renderer (not the Renderer wrapper).
   * @param {import('pixi.js').Renderer} pixiRenderer
   */
  renderMask(pixiRenderer) {
    if (!this._dirty || !this._renderTexture) return;

    pixiRenderer.render({
      container: this._stagingContainer,
      target: this._renderTexture,
      clear: true,
    });

    this._dirty = false;
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
   * Diffs light sprites — creates/updates/removes erase sprites for visibility lights.
   * Dark graphics is always first child; erase sprites are added after.
   */
  _rebuildSprites() {
    const tex = this._getGlowTexture();
    const activeIds = new Set();

    for (const light of this._lights) {
      const id = light.id;
      if (!id) continue;

      // Only visibility lights punch holes
      if (light.visibility !== true || light.enabled === false || (light.radius ?? 96) <= 0) {
        const existing = this._lightSprites.get(id);
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
      let sprite = this._lightSprites.get(id);
      if (!sprite) {
        sprite = new Sprite(tex);
        sprite.anchor.set(0.5);
        sprite.blendMode = "erase";
        this._lightSprites.set(id, sprite);
        this._stagingContainer.addChild(sprite);
      }

      sprite.x = x;
      sprite.y = y;
      sprite.width = radius * 2;
      sprite.height = radius * 2;
      sprite.alpha = 1.0;
      sprite.visible = true;

      activeIds.add(id);
    }

    // Remove sprites for lights that no longer exist
    for (const [id, sprite] of this._lightSprites) {
      if (!activeIds.has(id)) {
        this._stagingContainer.removeChild(sprite);
        sprite.destroy();
        this._lightSprites.delete(id);
      }
    }

    this._dirty = true;
  }

  /** Cleans up all resources. */
  destroy() {
    for (const sprite of this._lightSprites.values()) {
      sprite.destroy();
    }
    this._lightSprites.clear();

    if (this._glowTexture) {
      this._glowTexture.destroy(true);
      this._glowTexture = null;
    }

    if (this._renderTexture) {
      this._renderTexture.destroy(true);
      this._renderTexture = null;
    }

    this._darkGraphics.destroy();
    this._stagingContainer.destroy({ children: true });

    if (this._displaySprite) {
      this._displaySprite.destroy();
      this._displaySprite = null;
    }

    this.container.destroy({ children: true });
  }
}
