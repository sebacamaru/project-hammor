import { TILE_SIZE } from "../../../../src/shared/core/Config.js";

/**
 * Validates positions against the collision layer of a map.
 * Hitbox-based: checks all tiles covered by the player's hitbox.
 * Stateless — receives map as parameter.
 */
export class CollisionSystem {
  /**
   * Checks if a position is walkable on the given map using a hitbox.
   * Converts hitbox bounds to tile coords, checks each covered tile.
   * Out-of-bounds tiles are considered blocked unless the corresponding
   * border is marked as open in the optional openBorders parameter.
   * @param {MapData} map - The loaded map data.
   * @param {number} x - Feet X coordinate (center-bottom of sprite).
   * @param {number} y - Feet Y coordinate (center-bottom of sprite).
   * @param {{ offsetX: number, offsetY: number, width: number, height: number }} hitbox
   * @param {{ left: boolean, right: boolean, up: boolean, down: boolean }|null} [openBorders=null]
   *   If provided, OOB tiles on open borders are treated as walkable instead of blocked.
   * @returns {boolean} true if the position is walkable.
   */
  isWalkable(map, x, y, hitbox, openBorders = null) {
    const left = x + hitbox.offsetX;
    const top = y + hitbox.offsetY;
    const right = left + hitbox.width - 1;
    const bottom = top + hitbox.height - 1;

    const tileLeft = Math.floor(left / TILE_SIZE);
    const tileRight = Math.floor(right / TILE_SIZE);
    const tileTop = Math.floor(top / TILE_SIZE);
    const tileBottom = Math.floor(bottom / TILE_SIZE);

    for (let ty = tileTop; ty <= tileBottom; ty++) {
      for (let tx = tileLeft; tx <= tileRight; tx++) {
        if (!map.isInside(tx, ty)) {
          if (openBorders && this._isOnOpenBorder(tx, ty, map, openBorders)) {
            continue;
          }
          return false;
        }
        if (map.getTile("collision", tx, ty) >= 0) return false;
      }
    }
    return true;
  }

  /**
   * Returns true if an out-of-bounds tile is on a border that is marked open.
   * @param {number} tx - Tile X coordinate (may be negative or >= map.width).
   * @param {number} ty - Tile Y coordinate (may be negative or >= map.height).
   * @param {MapData} map
   * @param {{ left: boolean, right: boolean, up: boolean, down: boolean }} openBorders
   * @returns {boolean}
   */
  _isOnOpenBorder(tx, ty, map, openBorders) {
    if (tx < 0 && openBorders.left) return true;
    if (tx >= map.width && openBorders.right) return true;
    if (ty < 0 && openBorders.up) return true;
    if (ty >= map.height && openBorders.down) return true;
    return false;
  }
}
