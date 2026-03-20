import { TILE_SIZE } from "../core/Config.js";

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

  renderUpdate(target, alpha) {
    if (this.freeMode) return;
    if (!target) return;

    // Recalc bounds in case viewport changed since last frame
    this._recalcBounds();

    // Interpolated target position — matches what sprites will render
    const wx = target.worldX ?? target.x;
    const wy = target.worldY ?? target.y;
    const pwx = target.prevWorldX ?? target.prevX;
    const pwy = target.prevWorldY ?? target.prevY;
    const ix = pwx + (wx - pwx) * alpha;
    const iy = pwy + (wy - pwy) * alpha;

    this.x = ix - this.viewport.widthPx / 2;
    this.y = iy - this.viewport.heightPx / 2;

    this._clamp();

    // Snap to pixel grid — prevents sub-pixel jitter
    this.x = Math.floor(this.x);
    this.y = Math.floor(this.y);
  }

  _clamp() {
    if (this.bounds) {
      this.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.x));
      this.y = Math.max(this.bounds.minY, Math.min(this.bounds.maxY, this.y));
    }
  }
}
