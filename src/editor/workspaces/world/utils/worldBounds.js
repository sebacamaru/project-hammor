import { parseWorldKey } from './worldKey.js';

/**
 * @param {Map<string, object>} cells
 * @returns {{ minRx: number, maxRx: number, minRy: number, maxRy: number } | null}
 */
export function getWorldBounds(cells) {
  if (cells.size === 0) return null;

  let minRx = Infinity;
  let maxRx = -Infinity;
  let minRy = Infinity;
  let maxRy = -Infinity;

  for (const key of cells.keys()) {
    const coord = parseWorldKey(key);
    if (!coord) continue;
    if (coord.rx < minRx) minRx = coord.rx;
    if (coord.rx > maxRx) maxRx = coord.rx;
    if (coord.ry < minRy) minRy = coord.ry;
    if (coord.ry > maxRy) maxRy = coord.ry;
  }

  return { minRx, maxRx, minRy, maxRy };
}

/**
 * @param {{ minRx: number, maxRx: number, minRy: number, maxRy: number }} bounds
 * @param {number} margin
 * @returns {{ minRx: number, maxRx: number, minRy: number, maxRy: number }}
 */
export function expandBounds(bounds, margin) {
  return {
    minRx: bounds.minRx - margin,
    maxRx: bounds.maxRx + margin,
    minRy: bounds.minRy - margin,
    maxRy: bounds.maxRy + margin,
  };
}

/**
 * @param {Map<string, object>} cells
 * @returns {number}
 */
export function getWorldCellCount(cells) {
  return cells.size;
}
