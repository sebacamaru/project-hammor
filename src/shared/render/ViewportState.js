/**
 * Plain data object holding the current computed viewport configuration.
 * Mutated in-place by Renderer on resize — other systems hold a reference.
 */
export class ViewportState {
  constructor() {
    this.scale = 1;
    this.tilesX = 0;
    this.tilesY = 0;
    this.widthPx = 0;   // logical width in game pixels (tilesX * TILE_SIZE)
    this.heightPx = 0;  // logical height in game pixels (tilesY * TILE_SIZE)
    this.cssWidth = 0;   // final CSS width (widthPx * scale)
    this.cssHeight = 0;  // final CSS height (heightPx * scale)
    this.offsetX = 0;    // horizontal centering offset in CSS pixels
    this.offsetY = 0;    // vertical centering offset in CSS pixels
  }
}
