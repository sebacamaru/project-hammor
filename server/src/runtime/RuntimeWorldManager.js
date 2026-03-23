import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { makeRegionKey } from "../../../src/shared/world/WorldMath.js";
import { TILE_SIZE } from "../../../src/shared/core/Config.js";

/**
 * Loads world runtime JSON and provides adjacency queries.
 * Pre-computes open border flags per mapId for collision.
 */
export class RuntimeWorldManager {
  constructor() {
    /** @type {Map<string, WorldEntry>} worldId → parsed world with indexes */
    this.worlds = new Map();
  }

  /**
   * Loads a world runtime JSON from content/worlds/{worldId}.json.
   * Builds internal indexes for fast adjacency lookups.
   * @param {string} worldId
   * @returns {Promise<WorldEntry>}
   */
  async loadWorld(worldId) {
    if (this.worlds.has(worldId)) return this.worlds.get(worldId);

    const filePath = join(process.cwd(), "content", "worlds", `${worldId}.json`);
    const raw = await readFile(filePath, "utf-8");
    const json = JSON.parse(raw);

    if (!json.id || !Array.isArray(json.maps)) {
      throw new Error(`Invalid world JSON for "${worldId}"`);
    }

    /** @type {Map<string, { mapId: string, rx: number, ry: number }>} regionKey → entry */
    const byRegion = new Map();
    /** @type {Map<string, { mapId: string, rx: number, ry: number }>} mapId → entry */
    const byMapId = new Map();

    for (const entry of json.maps) {
      const key = makeRegionKey(entry.rx, entry.ry);
      byRegion.set(key, entry);
      byMapId.set(entry.mapId, entry);
    }

    // Pre-compute open borders per mapId
    /** @type {Map<string, { left: boolean, right: boolean, up: boolean, down: boolean }>} */
    const openBordersCache = new Map();
    for (const entry of json.maps) {
      openBordersCache.set(entry.mapId, {
        left: byRegion.has(makeRegionKey(entry.rx - 1, entry.ry)),
        right: byRegion.has(makeRegionKey(entry.rx + 1, entry.ry)),
        up: byRegion.has(makeRegionKey(entry.rx, entry.ry - 1)),
        down: byRegion.has(makeRegionKey(entry.rx, entry.ry + 1)),
      });
    }

    const world = {
      id: json.id,
      regionWidth: json.regionWidth,
      regionHeight: json.regionHeight,
      maps: json.maps,
      byRegion,
      byMapId,
      openBordersCache,
    };

    this.worlds.set(worldId, world);
    return world;
  }

  /**
   * Returns a loaded world entry, or undefined if not loaded.
   * @param {string} worldId
   * @returns {WorldEntry|undefined}
   */
  getWorld(worldId) {
    return this.worlds.get(worldId);
  }

  /**
   * Returns the region cell for a given mapId within a world.
   * @param {string} worldId
   * @param {string} mapId
   * @returns {{ mapId: string, rx: number, ry: number }|null}
   */
  getMapCell(worldId, mapId) {
    const world = this.worlds.get(worldId);
    return world?.byMapId.get(mapId) ?? null;
  }

  /**
   * Returns the neighbor mapId in the given direction, or null if none.
   * @param {string} worldId
   * @param {string} mapId
   * @param {"left"|"right"|"up"|"down"} direction
   * @returns {string|null}
   */
  getNeighborMapId(worldId, mapId, direction) {
    const world = this.worlds.get(worldId);
    if (!world) return null;

    const cell = world.byMapId.get(mapId);
    if (!cell) return null;

    let nx = cell.rx;
    let ny = cell.ry;
    if (direction === "left") nx--;
    else if (direction === "right") nx++;
    else if (direction === "up") ny--;
    else if (direction === "down") ny++;

    const neighbor = world.byRegion.get(makeRegionKey(nx, ny));
    return neighbor?.mapId ?? null;
  }

  /**
   * Returns cached open border flags for a mapId.
   * @param {string} worldId
   * @param {string} mapId
   * @returns {{ left: boolean, right: boolean, up: boolean, down: boolean }|null}
   */
  getOpenBorders(worldId, mapId) {
    const world = this.worlds.get(worldId);
    return world?.openBordersCache.get(mapId) ?? null;
  }

  /**
   * Returns the region size in pixels for a world.
   * @param {string} worldId
   * @returns {{ widthPx: number, heightPx: number }|null}
   */
  getRegionSizePx(worldId) {
    const world = this.worlds.get(worldId);
    if (!world) return null;
    return {
      widthPx: world.regionWidth * TILE_SIZE,
      heightPx: world.regionHeight * TILE_SIZE,
    };
  }

  /**
   * Returns all mapIds belonging to a world.
   * @param {string} worldId
   * @returns {string[]}
   */
  getMapIds(worldId) {
    const world = this.worlds.get(worldId);
    if (!world) return [];
    return world.maps.map((e) => e.mapId);
  }
}
