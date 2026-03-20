import { MapData } from "../../../../shared/data/models/MapData.js";
import { MapDocument } from "../document/MapDocument.js";

export class RuntimeMapBridge {
  // Full rebuild bridge: rebuilds a runtime MapData from the authoring document.
  // This keeps sync logic simple today and leaves room for future chunk updates.
  static toGameMapData(doc) {
    const { width, height, tileSize, chunkSize, id, tileset } = doc.meta;
    const layerNames = doc.layers.map((layer) => layer.id);
    const map = new MapData(width, height, tileSize, chunkSize, layerNames);

    map.id = id ?? null;
    map.tilesetId = tileset ?? null;

    for (const layer of doc.layers) {
      const storedLayerData = doc.getStoredLayerData(layer.id);
      if (!storedLayerData) continue;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = y * width + x;
          const storedTileId = storedLayerData[index];
          const tileId = MapDocument.fromStoredTileId(storedTileId);
          if (tileId < 0) continue;
          map.setTile(layer.id, x, y, tileId);
        }
      }
    }

    map.clearAllDirty();
    return map;
  }

  /**
   * Apply incremental tile changes from a MapDocument tilesChanged event
   * to an existing runtime MapData, returning the set of affected chunk keys.
   * @param {MapData} runtimeMap
   * @param {{ layerId: string, changes: Array<{ x: number, y: number, tileId: number }> }} event
   * @returns {Set<string>} affected chunk keys ("cx,cy")
   */
  static applyTilesChangedEvent(runtimeMap, event) {
    const { layerId, changes } = event;
    const affectedChunks = new Set();

    for (const { x, y, tileId } of changes) {
      const result = runtimeMap.setTile(layerId, x, y, tileId);
      if (result) {
        affectedChunks.add(`${result.cx},${result.cy}`);
      }
    }

    return affectedChunks;
  }
}
