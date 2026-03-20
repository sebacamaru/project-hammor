const CELL_KEY_PATTERN = /^-?\d+,-?\d+$/;

// Validates the minimum authored world contract before anything touches disk.
export function validateAuthoredWorldPayload(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "World payload must be a JSON object";
  }

  if (typeof data.id !== "string" || !data.id) {
    return "Missing or invalid 'id'";
  }

  if (!data.mapSize || typeof data.mapSize !== "object" || Array.isArray(data.mapSize)) {
    return "Missing or invalid 'mapSize'";
  }

  const { width, height } = data.mapSize;
  if (!Number.isInteger(width) || width <= 0) {
    return "mapSize.width must be a positive integer";
  }
  if (!Number.isInteger(height) || height <= 0) {
    return "mapSize.height must be a positive integer";
  }

  if (!data.cells || typeof data.cells !== "object" || Array.isArray(data.cells)) {
    return "'cells' must be an object";
  }

  for (const key of Object.keys(data.cells)) {
    if (!CELL_KEY_PATTERN.test(key)) {
      return `Invalid cell key "${key}" — expected "rx,ry" format`;
    }

    const cell = data.cells[key];
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
      return `Cell "${key}" must be an object`;
    }
    if (typeof cell.mapId !== "string" || !cell.mapId) {
      return `Cell "${key}" must have a non-empty string "mapId"`;
    }
  }

  return null;
}

// Keeps the persisted document id aligned with the route id being saved.
export function normalizeAuthoredWorldPayload(data, id) {
  return {
    id,
    name: typeof data.name === "string" && data.name ? data.name : id,
    version: Number.isInteger(data.version) && data.version > 0 ? data.version : 1,
    mapSize: {
      width: data.mapSize.width,
      height: data.mapSize.height,
    },
    cells: data.cells,
  };
}

// Rebuilds the runtime json format from the editor-authored document.
export function authoredToRuntimeJson(authored) {
  const maps = [];

  for (const [key, cell] of Object.entries(authored.cells)) {
    const [rxStr, ryStr] = key.split(",");
    maps.push({
      mapId: cell.mapId,
      rx: Number(rxStr),
      ry: Number(ryStr),
    });
  }

  maps.sort((a, b) => a.ry - b.ry || a.rx - b.rx);

  return {
    id: authored.id,
    regionWidth: authored.mapSize.width,
    regionHeight: authored.mapSize.height,
    maps,
  };
}

// Converts a runtime world back into authored format (compat path for legacy files).
export function runtimeToAuthoredJson(runtime) {
  const cells = {};

  if (Array.isArray(runtime.maps)) {
    for (const entry of runtime.maps) {
      if (
        !entry ||
        typeof entry !== "object" ||
        typeof entry.mapId !== "string" ||
        !Number.isFinite(entry.rx) ||
        !Number.isFinite(entry.ry)
      ) {
        continue;
      }
      cells[`${entry.rx},${entry.ry}`] = { mapId: entry.mapId };
    }
  }

  return {
    id: runtime.id,
    name: typeof runtime.name === "string" && runtime.name ? runtime.name : runtime.id,
    version: 1,
    mapSize: {
      width: runtime.regionWidth,
      height: runtime.regionHeight,
    },
    cells,
  };
}
