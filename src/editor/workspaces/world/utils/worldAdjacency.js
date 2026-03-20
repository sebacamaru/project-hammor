/**
 * @param {number} rx
 * @param {number} ry
 * @returns {Array<{ rx: number, ry: number }>}
 */
export function getOrthogonalNeighbors(rx, ry) {
  return [
    { rx: rx + 1, ry },
    { rx: rx - 1, ry },
    { rx, ry: ry + 1 },
    { rx, ry: ry - 1 },
  ];
}

/**
 * @param {number} aRx
 * @param {number} aRy
 * @param {number} bRx
 * @param {number} bRy
 * @returns {boolean}
 */
export function isOrthogonallyAdjacent(aRx, aRy, bRx, bRy) {
  const dx = Math.abs(aRx - bRx);
  const dy = Math.abs(aRy - bRy);
  return (dx + dy) === 1;
}
