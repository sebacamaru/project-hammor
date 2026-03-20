/**
 * @param {number} rx
 * @param {number} ry
 * @returns {string} "rx,ry"
 */
export function makeRegionKey(rx, ry) {
  return `${rx},${ry}`;
}

/**
 * @param {number} worldX - world position in pixels
 * @param {number} worldY - world position in pixels
 * @param {number} regionPixelWidth - region width in pixels
 * @param {number} regionPixelHeight - region height in pixels
 * @returns {{ rx: number, ry: number }}
 */
export function worldToRegion(worldX, worldY, regionPixelWidth, regionPixelHeight) {
  return {
    rx: Math.floor(worldX / regionPixelWidth),
    ry: Math.floor(worldY / regionPixelHeight),
  };
}

/**
 * @param {number} rx
 * @param {number} ry
 * @param {number} regionPixelWidth - region width in pixels
 * @param {number} regionPixelHeight - region height in pixels
 * @returns {{ x: number, y: number }}
 */
export function regionToWorldOffset(rx, ry, regionPixelWidth, regionPixelHeight) {
  return {
    x: rx * regionPixelWidth,
    y: ry * regionPixelHeight,
  };
}
