import { MapSerializer } from "../../../../src/editor/document/MapSerializer.js";
import { RuntimeMapImporter } from "../../../../src/editor/document/RuntimeMapImporter.js";
import { RuntimeMapBridge } from "../../../../src/editor/runtime/RuntimeMapBridge.js";

// Validates the minimum authored map contract before anything touches disk.
export function validateAuthoredPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "Map payload must be a JSON object";
  }

  if (!payload.meta || typeof payload.meta !== "object" || Array.isArray(payload.meta)) {
    return 'Map payload must include a "meta" object';
  }

  if (!Number.isFinite(payload.meta.width) || payload.meta.width <= 0) {
    return 'Map payload must include a valid numeric "meta.width"';
  }

  if (!Number.isFinite(payload.meta.height) || payload.meta.height <= 0) {
    return 'Map payload must include a valid numeric "meta.height"';
  }

  if (!Number.isFinite(payload.meta.tileSize) || payload.meta.tileSize <= 0) {
    return 'Map payload must include a valid numeric "meta.tileSize"';
  }

  if (!Number.isFinite(payload.meta.chunkSize) || payload.meta.chunkSize <= 0) {
    return 'Map payload must include a valid numeric "meta.chunkSize"';
  }

  if (!Array.isArray(payload.layers)) {
    return 'Map payload must include a "layers" array';
  }

  const expectedLayerSize = payload.meta.width * payload.meta.height;

  for (const layer of payload.layers) {
    if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
      return "Each layer must be an object";
    }
    if (typeof layer.id !== "string" || layer.id.length === 0) {
      return 'Each layer must include a non-empty string "id"';
    }
    if (!Array.isArray(layer.data)) {
      return `Layer "${layer.id}" must include a "data" array`;
    }
    if (layer.data.length !== expectedLayerSize) {
      return `Layer "${layer.id}" must have ${expectedLayerSize} tiles`;
    }
  }

  return null;
}

// Keeps the persisted document id aligned with the route id being saved.
export function normalizeAuthoredPayload(mapId, payload) {
  return {
    ...payload,
    meta: {
      ...payload.meta,
      id: mapId,
    },
  };
}

// Temporary compat path for runtime-only maps that haven't been re-saved by the editor yet.
export function runtimeToAuthoredJson(runtimeJson) {
  const document = RuntimeMapImporter.fromRuntimeJson(runtimeJson);
  return MapSerializer.serialize(document);
}

// Rebuilds the current runtime json format from the editor-authored document.
export function authoredToRuntimeJson(authoredJson) {
  const document = MapSerializer.deserialize(authoredJson);
  const runtimeMap = RuntimeMapBridge.toGameMapData(document);

  return {
    version: document.meta.version ?? 1,
    id: document.meta.id ?? null,
    tileset: document.meta.tileset ?? null,
    width: runtimeMap.width,
    height: runtimeMap.height,
    tileSize: runtimeMap.tileSize,
    chunkSize: runtimeMap.chunkSize,
    layers: [...runtimeMap.layerNames],
    chunks: [...runtimeMap.chunks.values()]
      .sort((a, b) => (a.cy - b.cy) || (a.cx - b.cx))
      .map((chunk) => {
        const tiles = {};

        for (const layerName of runtimeMap.layerNames) {
          const data = chunk.getLayer(layerName);
          if (!data || !data.some((value) => value >= 0)) {
            continue;
          }

          tiles[layerName] = {
            encoding: "raw",
            data: Array.from(data),
          };
        }

        return {
          cx: chunk.cx,
          cy: chunk.cy,
          tiles,
        };
      })
      .filter((chunk) => Object.keys(chunk.tiles).length > 0),
  };
}
