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
   * Out-of-bounds tiles are considered blocked.
   * @param {MapData} map - The loaded map data.
   * @param {number} x - Feet X coordinate (center-bottom of sprite).
   * @param {number} y - Feet Y coordinate (center-bottom of sprite).
   * @param {{ offsetX: number, offsetY: number, width: number, height: number }} hitbox
   * @returns {boolean} true if the position is walkable.
   */
  isWalkable(map, x, y, hitbox) {
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
        if (!map.isInside(tx, ty)) return false;
        if (map.getTile("collision", tx, ty) >= 0) return false;
      }
    }
    return true;
  }
}
