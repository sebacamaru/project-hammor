import { TILE_SIZE } from "../../../../src/shared/core/Config.js";

/**
 * Detects players that have walked past a map boundary after movement
 * and handles the transition to the neighbor map.
 * Runs once per tick, after MovementSystem.
 */
export class MapTransitionSystem {
  /**
   * @param {string} serverName - Server name for log prefix.
   */
  constructor(serverName = "MINIMMO") {
    this.serverName = serverName;
  }

  /**
   * Checks all players for out-of-bounds positions and transitions them
   * to the neighboring map if one exists, or clamps them back inside.
   * @param {Map<string, ServerPlayer>} players
   * @param {RuntimeMapManager} runtimeMaps
   * @param {RuntimeWorldManager} runtimeWorlds
   */
  update(players, runtimeMaps, runtimeWorlds) {
    for (const player of players.values()) {
      if (!player.worldId) continue;

      const map = runtimeMaps.getMap(player.mapId);
      if (!map) continue;

      const mapWidthPx = map.width * TILE_SIZE;
      const mapHeightPx = map.height * TILE_SIZE;

      // Determine which border was crossed (if any)
      const direction = this._getOOBDirection(player, mapWidthPx, mapHeightPx);
      if (!direction) continue;

      const neighborId = runtimeWorlds.getNeighborMapId(
        player.worldId,
        player.mapId,
        direction,
      );

      if (neighborId) {
        const neighborMap = runtimeMaps.getMap(neighborId);
        if (!neighborMap) {
          // Neighbor map not loaded — clamp as fallback
          this._clamp(player, mapWidthPx, mapHeightPx);
          console.warn(
            `[${this.serverName}] Neighbor map "${neighborId}" not loaded — clamped ${player.id}`,
          );
          continue;
        }

        const oldMapId = player.mapId;
        this._reposition(player, direction, mapWidthPx, mapHeightPx, neighborMap);
        player.mapId = neighborId;

        console.log(
          `[${this.serverName}] Player ${player.id} left ${oldMapId} → entered ${neighborId}`,
        );
      } else {
        // No neighbor — clamp inside current map
        this._clamp(player, mapWidthPx, mapHeightPx);
      }
    }
  }

  /**
   * Returns the direction of border crossing, or null if player is in-bounds.
   * Checks X before Y (matches per-axis collision order).
   * @param {ServerPlayer} player
   * @param {number} mapWidthPx
   * @param {number} mapHeightPx
   * @returns {"left"|"right"|"up"|"down"|null}
   */
  _getOOBDirection(player, mapWidthPx, mapHeightPx) {
    if (player.x < 0) return "left";
    if (player.x >= mapWidthPx) return "right";
    if (player.y < 0) return "up";
    if (player.y >= mapHeightPx) return "down";
    return null;
  }

  /**
   * Repositions a player into the neighbor map after a border crossing.
   * Wraps the out-of-bounds coordinate to the opposite edge of the neighbor.
   * Preserves the other coordinate unchanged.
   * @param {ServerPlayer} player
   * @param {"left"|"right"|"up"|"down"} direction
   * @param {number} mapWidthPx - Current map width in pixels.
   * @param {number} mapHeightPx - Current map height in pixels.
   * @param {MapData} neighborMap - The neighbor's loaded map data.
   */
  _reposition(player, direction, mapWidthPx, mapHeightPx, neighborMap) {
    const neighborWidthPx = neighborMap.width * TILE_SIZE;
    const neighborHeightPx = neighborMap.height * TILE_SIZE;

    switch (direction) {
      case "left":
        // x is negative → wrap to right side of neighbor
        player.x = neighborWidthPx + player.x;
        break;
      case "right":
        // x >= mapWidthPx → wrap to left side of neighbor
        player.x = player.x - mapWidthPx;
        break;
      case "up":
        // y is negative → wrap to bottom side of neighbor
        player.y = neighborHeightPx + player.y;
        break;
      case "down":
        // y >= mapHeightPx → wrap to top side of neighbor
        player.y = player.y - mapHeightPx;
        break;
    }
  }

  /**
   * Clamps player position back inside the current map boundaries.
   * Used when no neighbor exists in the crossed direction.
   * @param {ServerPlayer} player
   * @param {number} mapWidthPx
   * @param {number} mapHeightPx
   */
  _clamp(player, mapWidthPx, mapHeightPx) {
    if (player.x < 0) player.x = 0;
    if (player.x >= mapWidthPx) player.x = mapWidthPx - 0.01;
    if (player.y < 0) player.y = 0;
    if (player.y >= mapHeightPx) player.y = mapHeightPx - 0.01;
  }
}
