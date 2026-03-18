import { MapData } from "../models/MapData.js";
import { TilesetRegistry } from "./TilesetRegistry.js";

export class MapLoader {
  static async load(mapUrl) {
    const mapResponse = await fetch(mapUrl);
    if (!mapResponse.ok) {
      throw new Error(`Failed to load map from ${mapUrl}: ${mapResponse.status}`);
    }
    const mapJson = await mapResponse.json();

    const tilesetId = mapJson.tileset ?? "world";
    const tilesetJson = await TilesetRegistry.load(tilesetId);

    // Build MapData
    const map = new MapData(
      mapJson.width,
      mapJson.height,
      mapJson.tileSize,
      mapJson.chunkSize,
      mapJson.layers,
    );
    map.id = mapJson.id;
    map.tilesetId = tilesetId;
    map.tileset = tilesetJson;

    // Load chunks
    const expectedLength = mapJson.chunkSize * mapJson.chunkSize;
    for (const chunkJson of mapJson.chunks) {
      const chunk = map.createChunk(chunkJson.cx, chunkJson.cy);

      for (const [layerName, layerInfo] of Object.entries(chunkJson.tiles)) {
        if (layerInfo.encoding !== "raw") {
          throw new Error(
            `Unsupported encoding "${layerInfo.encoding}" in chunk (${chunkJson.cx},${chunkJson.cy}) layer "${layerName}"`,
          );
        }
        // Empty data = layer exists but has no tile data yet, keep as all-zeros
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
      // Layers not present in the chunk JSON stay as all-zeros (initialized by ChunkData)
    }

    return map;
  }
}
