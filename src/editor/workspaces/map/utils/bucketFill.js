/**
 * Performs an iterative BFS flood fill on the given layer of a MapDocument.
 *
 * @param {object} params
 * @param {import("../document/MapDocument.js").MapDocument} params.doc
 * @param {string} params.layerId
 * @param {number} params.startX - Tile X coordinate of the fill origin.
 * @param {number} params.startY - Tile Y coordinate of the fill origin.
 * @param {number} params.replacementTileId - Tile ID to paint with.
 * @returns {{ changes: Array<{x: number, y: number, tileId: number}> }}
 */
export function bucketFill({ doc, layerId, startX, startY, replacementTileId }) {
  const { width, height } = doc.meta;
  const targetTile = doc.getTile(layerId, startX, startY);

  if (targetTile === replacementTileId) {
    return { changes: [] };
  }

  const changes = [];
  const visited = new Set();

  // BFS queue using a flat array with a head index to avoid O(n) Array.shift().
  const queue = [startX, startY];
  let head = 0;

  while (head < queue.length) {
    const x = queue[head];
    const y = queue[head + 1];
    head += 2;

    // Bounds check.
    if (x < 0 || y < 0 || x >= width || y >= height) continue;

    const key = y * width + x;
    if (visited.has(key)) continue;
    visited.add(key);

    const currentTile = doc.getTile(layerId, x, y);
    if (currentTile !== targetTile) continue;

    changes.push({ x, y, tileId: replacementTileId });

    // Enqueue 4-directional neighbors.
    queue.push(x + 1, y);
    queue.push(x - 1, y);
    queue.push(x, y + 1);
    queue.push(x, y - 1);
  }

  return { changes };
}
