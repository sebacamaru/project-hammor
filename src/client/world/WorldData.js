import { makeRegionKey } from "../../shared/world/WorldMath.js";

export class WorldData {
  /**
   * @param {string} id
   * @param {number} regionWidth - region width in tiles
   * @param {number} regionHeight - region height in tiles
   * @param {Array<{ mapId: string, rx: number, ry: number }>} maps
   */
  constructor(id, regionWidth, regionHeight, maps) {
    this.id = id;
    this.regionWidth = regionWidth;
    this.regionHeight = regionHeight;
    this.maps = maps;

    /** @type {Map<string, { mapId: string, rx: number, ry: number }>} */
    this._byRegion = new Map();
    /** @type {Map<string, { mapId: string, rx: number, ry: number }>} */
    this._byMapId = new Map();

    for (const entry of maps) {
      this._byRegion.set(makeRegionKey(entry.rx, entry.ry), entry);
      this._byMapId.set(entry.mapId, entry);
    }
  }

  /**
   * @param {string} url
   * @returns {Promise<WorldData>}
   */
  static async load(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load world: HTTP ${res.status}`);
    const json = await res.json();
    return new WorldData(json.id, json.regionWidth, json.regionHeight, json.maps);
  }

  /**
   * @param {number} rx
   * @param {number} ry
   * @returns {{ mapId: string, rx: number, ry: number } | null}
   */
  getEntry(rx, ry) {
    return this._byRegion.get(makeRegionKey(rx, ry)) ?? null;
  }

  /**
   * @param {string} mapId
   * @returns {{ mapId: string, rx: number, ry: number } | null}
   */
  getMapEntry(mapId) {
    return this._byMapId.get(mapId) ?? null;
  }
}
