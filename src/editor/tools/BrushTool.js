/**
 * Paints tiles onto a map layer.
 */
export class BrushTool {
  /**
   * @param {import('../../shared/data/models/MapData.js').MapData} mapData
   * @param {number} x
   * @param {number} y
   * @param {number} tileId
   * @param {string} layerName
   */
  apply(mapData, x, y, tileId, layerName) {
    mapData.setTile(layerName, x, y, tileId);
  }
}
