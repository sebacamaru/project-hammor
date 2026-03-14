/**
 * Server-side map wrapper.
 * Holds a MapData instance and provides server-specific queries.
 */
export class WorldMap {
  /**
   * @param {import('../../shared/data/models/MapData.js').MapData} mapData
   */
  constructor(mapData) {
    this.data = mapData;
  }

  get width() {
    return this.data.width;
  }

  get height() {
    return this.data.height;
  }

  isWalkable(x, y) {
    // Stub: all tiles are walkable for now.
    // Will check collision layer when implemented.
    const tile = this.data.getTile("ground", x, y);
    return tile >= 0;
  }
}
