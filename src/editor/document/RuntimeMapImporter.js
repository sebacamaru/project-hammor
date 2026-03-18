import { MapDocument } from "./MapDocument.js";

export class RuntimeMapImporter {
  static fromRuntimeJson(mapJson) {
    const width = mapJson.width;
    const height = mapJson.height;
    const layerSize = width * height;
    const layers = mapJson.layers.map((layerId) => ({
      id: layerId,
      kind: layerId,
      visible: true,
      data: new Uint16Array(layerSize),
    }));

    for (const layer of layers) {
      layer.data.fill(MapDocument.EMPTY_STORED_TILE_ID);
    }

    const layerMap = new Map(layers.map((layer) => [layer.id, layer]));
    const chunkSize = mapJson.chunkSize;

    for (const chunk of mapJson.chunks ?? []) {
      for (const [layerId, layerInfo] of Object.entries(chunk.tiles ?? {})) {
        const targetLayer = layerMap.get(layerId);
        if (!targetLayer || layerInfo.encoding !== "raw") continue;
        if (!Array.isArray(layerInfo.data) || layerInfo.data.length === 0) continue;

        for (let localY = 0; localY < chunkSize; localY++) {
          for (let localX = 0; localX < chunkSize; localX++) {
            const worldX = chunk.cx * chunkSize + localX;
            const worldY = chunk.cy * chunkSize + localY;
            if (worldX >= width || worldY >= height) continue;

            const sourceIndex = localY * chunkSize + localX;
            const targetIndex = worldY * width + worldX;
            targetLayer.data[targetIndex] = MapDocument.toStoredTileId(
              layerInfo.data[sourceIndex],
            );
          }
        }
      }
    }

    const doc = new MapDocument({
      version: mapJson.version ?? 1,
      id: mapJson.id ?? null,
      tileset: mapJson.tileset ?? null,
      width,
      height,
      tileSize: mapJson.tileSize,
      chunkSize: mapJson.chunkSize,
    }, layers);

    doc.markClean();
    return doc;
  }
}
