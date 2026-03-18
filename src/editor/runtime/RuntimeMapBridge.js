import { MapData } from "../../shared/data/models/MapData.js";
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

    return map;
  }
}
