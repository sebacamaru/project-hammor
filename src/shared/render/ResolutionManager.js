import {
  TILE_SIZE,
  BASE_TILES_X,
  BASE_TILES_Y,
  MIN_SCALE,
  MAX_SCALE,
  MIN_TILES_X,
  MAX_TILES_X,
  MIN_TILES_Y,
  MAX_TILES_Y,
} from "../core/Config.js";

/**
 * Computes the best viewport configuration for the given container size.
 * Pure function — no side effects, no state.
 *
 * Priority order:
 *  1. Highest valid integer scale within MIN_SCALE..MAX_SCALE
 *  2. Tile count as close as possible to BASE_TILES_X / BASE_TILES_Y
 *  3. Tile count clamped within allowed min/max ranges
 *  4. Canvas centered when extra space remains
 *
 * @param {number} parentWidth  Available container width in CSS pixels
 * @param {number} parentHeight Available container height in CSS pixels
 * @param {ViewportState} out   ViewportState to mutate in-place
 */
export function computeViewport(parentWidth, parentHeight, out) {
  let bestScale = MIN_SCALE;
  let bestTilesX = BASE_TILES_X;
  let bestTilesY = BASE_TILES_Y;

  // Try scales from highest to lowest — first valid match wins
  for (let scale = MAX_SCALE; scale >= MIN_SCALE; scale--) {
    const tileStep = TILE_SIZE * scale;

    // How many tiles to cover the screen (overscan — rounds up)
    let tilesX = Math.ceil(parentWidth / tileStep);
    let tilesY = Math.ceil(parentHeight / tileStep);

    // Clamp to allowed tile ranges
    tilesX = Math.max(MIN_TILES_X, Math.min(MAX_TILES_X, tilesX));
    tilesY = Math.max(MIN_TILES_Y, Math.min(MAX_TILES_Y, tilesY));

    // Accept if at least MIN tiles fit at this scale
    if (MIN_TILES_X * tileStep <= parentWidth && MIN_TILES_Y * tileStep <= parentHeight) {
      bestScale = scale;
      bestTilesX = tilesX;
      bestTilesY = tilesY;
      break;
    }
  }

  // Compute final values
  out.scale = bestScale;
  out.tilesX = bestTilesX;
  out.tilesY = bestTilesY;
  out.widthPx = bestTilesX * TILE_SIZE;
  out.heightPx = bestTilesY * TILE_SIZE;
  out.cssWidth = out.widthPx * bestScale;
  out.cssHeight = out.heightPx * bestScale;
  out.offsetX = Math.floor((parentWidth - out.cssWidth) / 2);
  out.offsetY = Math.floor((parentHeight - out.cssHeight) / 2);
}
