/**
 * Erases tiles (sets to 0) on a map layer.
 */
export class EraserTool {
  /**
   * @param {import('../../shared/data/models/MapData.js').MapData} mapData
   * @param {number} x
   * @param {number} y
   * @param {string} layerName
   */
  apply(mapData, x, y, layerName) {
    mapData.setTile(layerName, x, y, 0);
  }
}
