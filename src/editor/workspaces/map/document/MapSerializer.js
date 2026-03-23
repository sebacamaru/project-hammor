import { MapDocument } from "./MapDocument.js";
import { snapWorldToFeet } from "../../../../shared/core/TileMath.js";

export class MapSerializer {
  /** @param {MapDocument} doc */
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
      entities: doc.entities,
    };
  }

  /** @param {string|object} json */
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
      })), obj.entities ?? []);
      // Normalize entity positions to tile grid (safety pass for legacy/hand-edited data)
      const tileSize = doc.meta.tileSize ?? 16;
      for (const entity of doc.entities) {
        if (entity.x != null && entity.y != null) {
          const { x, y } = snapWorldToFeet(entity.x, entity.y, tileSize);
          entity.x = x;
          entity.y = y;
        }
      }

      doc.markClean();
      return doc;
    }

    throw new Error("Unsupported map document format");
  }
}
