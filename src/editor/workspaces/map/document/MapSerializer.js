import { MapDocument } from "./MapDocument.js";

export class MapSerializer {
  static serialize(doc) {
    return {
      meta: {
        ...doc.meta,
      },
      layers: doc.layers.map((layer) => ({
        id: layer.id,
        kind: layer.kind,
        visible: layer.visible,
        data: Array.from(layer.data, (storedTileId) => MapDocument.fromStoredTileId(storedTileId)),
      })),
    };
  }

  static deserialize(json) {
    const obj = typeof json === "string" ? JSON.parse(json) : json;

    if (obj?.meta && Array.isArray(obj.layers)) {
      const doc = new MapDocument(obj.meta, obj.layers.map((layer) => ({
        id: layer.id,
        kind: layer.kind,
        visible: layer.visible,
        data: Uint16Array.from(
          layer.data ?? [],
          (tileId) => MapDocument.toStoredTileId(tileId),
        ),
      })));
      doc.markClean();
      return doc;
    }

    throw new Error("Unsupported map document format");
  }
}
