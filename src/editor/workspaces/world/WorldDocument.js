import { makeWorldKey, parseWorldKey } from './utils/worldKey.js';
import { getOrthogonalNeighbors } from './utils/worldAdjacency.js';
import { getWorldBounds } from './utils/worldBounds.js';

export class WorldDocument {
  /**
   * @param {object} [data]
   */
  constructor(data = {}) {
    this.id = data.id ?? 'untitled';
    this.name = data.name ?? 'Untitled World';
    this.version = data.version ?? 1;

    /** @type {Map<string, { mapId: string }>} */
    this._cells = new Map();

    const cells = data.cells ?? {};
    for (const [key, value] of Object.entries(cells)) {
      this._cells.set(key, { mapId: value.mapId });
    }
  }

  static createEmpty() {
    return new WorldDocument();
  }

  /**
   * @param {number} rx
   * @param {number} ry
   * @returns {string}
   */
  makeKey(rx, ry) {
    return makeWorldKey(rx, ry);
  }

  /**
   * @param {number} rx
   * @param {number} ry
   * @returns {boolean}
   */
  hasCell(rx, ry) {
    return this._cells.has(makeWorldKey(rx, ry));
  }

  /**
   * @param {number} rx
   * @param {number} ry
   * @returns {{ mapId: string } | null}
   */
  getCell(rx, ry) {
    return this._cells.get(makeWorldKey(rx, ry)) ?? null;
  }

  /**
   * @param {number} rx
   * @param {number} ry
   * @param {{ mapId: string }} value
   */
  setCell(rx, ry, value) {
    this._cells.set(makeWorldKey(rx, ry), { mapId: value.mapId });
  }

  /**
   * @param {number} rx
   * @param {number} ry
   */
  removeCell(rx, ry) {
    this._cells.delete(makeWorldKey(rx, ry));
  }

  /** @returns {boolean} */
  isEmpty() {
    return this._cells.size === 0;
  }

  /** @returns {number} */
  getCellCount() {
    return this._cells.size;
  }

  /** @returns {{ minRx: number, maxRx: number, minRy: number, maxRy: number } | null} */
  getBounds() {
    return getWorldBounds(this._cells);
  }

  /**
   * @param {string} mapId
   * @returns {{ rx: number, ry: number, key: string, cell: { mapId: string } } | null}
   */
  findMapUsage(mapId) {
    for (const [key, cell] of this._cells) {
      if (cell.mapId === mapId) {
        const coord = parseWorldKey(key);
        return { rx: coord.rx, ry: coord.ry, key, cell };
      }
    }
    return null;
  }

  /**
   * @param {number} rx
   * @param {number} ry
   * @returns {boolean}
   */
  canPlaceAt(rx, ry) {
    if (this.hasCell(rx, ry)) return false;

    if (this.isEmpty()) {
      return rx === 0 && ry === 0;
    }

    const neighbors = getOrthogonalNeighbors(rx, ry);
    return neighbors.some(n => this.hasCell(n.rx, n.ry));
  }

  /**
   * @param {number} rx
   * @param {number} ry
   * @param {string} mapId
   * @returns {boolean}
   */
  canAssignMap(rx, ry, mapId) {
    if (!mapId) return false;
    if (this.findMapUsage(mapId) !== null) return false;
    return this.canPlaceAt(rx, ry);
  }

  /**
   * @returns {{ key: string, rx: number, ry: number, cell: { mapId: string } }[]}
   */
  getCellEntries() {
    const entries = [];
    for (const [key, cell] of this._cells) {
      const coord = parseWorldKey(key);
      entries.push({ key, rx: coord.rx, ry: coord.ry, cell });
    }
    return entries;
  }

  /** @returns {object} */
  toJSON() {
    const cells = {};
    const sortedKeys = [...this._cells.keys()].sort();
    for (const key of sortedKeys) {
      const cell = this._cells.get(key);
      cells[key] = { mapId: cell.mapId };
    }
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      cells,
    };
  }
}
