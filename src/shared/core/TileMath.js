/**
 * Pure tile ↔ pixel conversion helpers.
 * Used by the editor to enforce grid-snapped entity positioning.
 */

/**
 * Converts world pixel coordinates to tile coordinates.
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} tileSize
 * @returns {{ tx: number, ty: number }}
 */
export function worldToTile(worldX, worldY, tileSize) {
  return {
    tx: Math.floor(worldX / tileSize),
    ty: Math.floor(worldY / tileSize),
  };
}

/**
 * Converts tile coordinates to pixel feet position (center-bottom of tile).
 * @param {number} tx
 * @param {number} ty
 * @param {number} tileSize
 * @returns {{ x: number, y: number }}
 */
export function tileToFeet(tx, ty, tileSize) {
  return {
    x: tx * tileSize + tileSize / 2,
    y: ty * tileSize + tileSize,
  };
}

/**
 * Snaps world coordinates to the feet position of the containing tile.
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} tileSize
 * @returns {{ x: number, y: number }}
 */
export function snapWorldToFeet(worldX, worldY, tileSize) {
  const { tx, ty } = worldToTile(worldX, worldY, tileSize);
  return tileToFeet(tx, ty, tileSize);
}
