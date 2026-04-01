/**
 * Resolve a tileset group into an array of valid tile IDs.
 * Supports both legacy { startId, count } and new { tiles[] } formats.
 * Preserves original order for tiles[], deduplicates, filters invalid entries.
 * @param {Object} group
 * @returns {number[]}
 */
export function getGroupTiles(group) {
  let tiles = [];

  if (Array.isArray(group?.tiles)) {
    tiles = group.tiles;
  } else if (
    Number.isInteger(group?.startId) &&
    Number.isInteger(group?.count) &&
    group.count > 0
  ) {
    tiles = Array.from({ length: group.count }, (_, i) => group.startId + i);
  }

  const out = [];
  const seen = new Set();

  for (const id of tiles) {
    if (!Number.isInteger(id) || id < 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out;
}
