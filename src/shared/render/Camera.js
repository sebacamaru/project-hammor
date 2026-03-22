import { TILE_SIZE, DEBUG_FLAGS } from "../core/Config.js";

export class Camera {
  /**
   * @param {import('./ViewportState.js').ViewportState} viewport
   */
  constructor(viewport) {
    this.viewport = viewport;
    this.x = 0;
    this.y = 0;
    this.target = null;
    this.bounds = null;
    this.freeMode = false;
    this.debugSpeed = 4;
  }

  /** @param {object} entity - Entity to follow */
  follow(entity) {
    this.target = entity;
  }

  setBounds(mapWidth, mapHeight) {
    this.mapWidthPx = mapWidth * TILE_SIZE;
    this.mapHeightPx = mapHeight * TILE_SIZE;
    this._worldLeft = null;
    this._worldTop = null;
    this._worldRight = null;
    this._worldBottom = null;
    this._recalcBounds();
  }

  setWorldBounds(left, top, right, bottom) {
    this._worldLeft = left;
    this._worldTop = top;
    this._worldRight = right;
    this._worldBottom = bottom;
    this.mapWidthPx = null;
    this.mapHeightPx = null;
    this._recalcBounds();
  }

  /** Recompute clamping bounds from current viewport size */
  _recalcBounds() {
    if (this._worldRight != null) {
      this.bounds = {
        minX: this._worldLeft,
        minY: this._worldTop,
        maxX: Math.max(this._worldLeft, this._worldRight - this.viewport.widthPx),
        maxY: Math.max(this._worldTop, this._worldBottom - this.viewport.heightPx),
      };
    } else if (this.mapWidthPx != null) {
      this.bounds = {
        minX: 0,
        minY: 0,
        maxX: Math.max(0, this.mapWidthPx - this.viewport.widthPx),
        maxY: Math.max(0, this.mapHeightPx - this.viewport.heightPx),
      };
    }
  }

  update() {
    if (!this.target) return;

    const tx = this.target.worldX ?? this.target.x;
    const ty = this.target.worldY ?? this.target.y;
    this.x = tx - this.viewport.widthPx / 2;
    this.y = ty - this.viewport.heightPx / 2;

    this._clamp();
  }

  debugMove(input) {
    if (input.held("KeyI")) this.y -= this.debugSpeed;
    if (input.held("KeyK")) this.y += this.debugSpeed;
    if (input.held("KeyJ")) this.x -= this.debugSpeed;
    if (input.held("KeyL")) this.x += this.debugSpeed;

    this._clamp();

    this.x = Math.floor(this.x);
    this.y = Math.floor(this.y);
  }

  /**
   * Update camera position for rendering. Snaps to the integer ideal
   * camera position derived from the target entity, matching the same
   * position formula used by PlayerView to avoid desync.
   * @param {object} target   - Entity to follow (needs prevX/prevY, x/y)
   * @param {number} alpha    - Interpolation fraction (0–1)
   */
  renderUpdate(target, alpha) {
    if (this.freeMode) return;
    if (!target) return;

    this._recalcBounds();

    // Position formula must match PlayerView to avoid camera/sprite desync
    let ix, iy;
    if (DEBUG_FLAGS.NET_ENABLE_CLIENT_PREDICTION) {
      // Prediction ON: direct position, no interpolation
      ix = Math.round(target.x);
      iy = Math.round(target.y);
    } else if (DEBUG_FLAGS.NET_ENABLE_REMOTE_INTERPOLATION) {
      // Prediction OFF + interp ON: interpolate between snapshots
      ix = Math.round(target.prevX + (target.x - target.prevX) * alpha);
      iy = Math.round(target.prevY + (target.y - target.prevY) * alpha);
    } else {
      // Prediction OFF + interp OFF: snap to last server position
      ix = Math.round(target.x);
      iy = Math.round(target.y);
    }

    this.x = ix - Math.round(this.viewport.widthPx / 2);
    this.y = iy - Math.round(this.viewport.heightPx / 2);

    this._clamp();
  }

  _clamp() {
    if (this.bounds) {
      this.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.x));
      this.y = Math.max(this.bounds.minY, Math.min(this.bounds.maxY, this.y));
    }
  }
}
