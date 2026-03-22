import { readFile } from "node:fs/promises";
import path from "node:path";
import { MapData } from "../../../src/shared/data/models/MapData.js";

/**
 * Loads and caches runtime map data from the filesystem.
 * Reads chunk-based JSON maps from content/maps/ and builds MapData instances.
 * Server-side equivalent of MapLoader (which uses fetch for the browser).
 */
export class RuntimeMapManager {
  constructor() {
    /** @type {Map<string, MapData>} mapId → loaded MapData */
    this.maps = new Map();
  }

  /**
   * Loads a map by id from content/maps/{mapId}.json.
   * Returns cached instance if already loaded.
   * @param {string} mapId - The map identifier (filename without extension).
   * @returns {Promise<MapData>} The loaded map data.
   * @throws {Error} If the file doesn't exist or fails to parse.
   */
  async loadMap(mapId) {
    if (this.maps.has(mapId)) return this.maps.get(mapId);

    const filePath = path.join(process.cwd(), "content", "maps", `${mapId}.json`);

    let mapJson;
    try {
      const raw = await readFile(filePath, "utf-8");
      mapJson = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `Failed to load runtime map "${mapId}" from ${filePath}: ${err.message}`,
      );
    }

    // Build MapData (same chunk-loading logic as shared MapLoader, without tileset)
    const map = new MapData(
      mapJson.width,
      mapJson.height,
      mapJson.tileSize,
      mapJson.chunkSize,
      mapJson.layers,
    );
    map.id = mapJson.id;
    map.tilesetId = mapJson.tileset ?? null;

    // Load chunk tile data
    const expectedLength = mapJson.chunkSize * mapJson.chunkSize;
    for (const chunkJson of mapJson.chunks) {
      const chunk = map.createChunk(chunkJson.cx, chunkJson.cy);

      for (const [layerName, layerInfo] of Object.entries(chunkJson.tiles)) {
        if (layerInfo.encoding !== "raw") {
          throw new Error(
            `Unsupported encoding "${layerInfo.encoding}" in chunk (${chunkJson.cx},${chunkJson.cy}) layer "${layerName}"`,
          );
        }
        if (layerInfo.data.length === 0) continue;
        if (layerInfo.data.length !== expectedLength) {
          throw new Error(
            `Invalid data length in chunk (${chunkJson.cx},${chunkJson.cy}) layer "${layerName}": expected ${expectedLength}, got ${layerInfo.data.length}`,
          );
        }
        const layer = chunk.getLayer(layerName);
        if (layer) {
          layer.set(layerInfo.data);
        }
      }
    }

    this.maps.set(mapId, map);
    return map;
  }

  /**
   * Returns a previously loaded map, or undefined if not loaded.
   * @param {string} mapId
   * @returns {MapData|undefined}
   */
  getMap(mapId) {
    return this.maps.get(mapId);
  }
}
