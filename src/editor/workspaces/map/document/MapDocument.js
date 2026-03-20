// Internally the editor stores layer data in Uint16Array. Because Uint16Array
// cannot represent -1, we reserve the max uint16 value as the empty sentinel.
const EMPTY_STORED_TILE_ID = 0xffff;
const DEV = import.meta.env?.DEV ?? false;

export class MapDocument {
  static EMPTY_STORED_TILE_ID = EMPTY_STORED_TILE_ID;

  constructor(meta = {}, layers = []) {
    this.meta = { ...meta };
    this.layers = layers.map((layer) => ({
      id: layer.id,
      kind: layer.kind ?? layer.id,
      visible: layer.visible ?? true,
      data: layer.data instanceof Uint16Array
        ? new Uint16Array(layer.data)
        : Uint16Array.from(layer.data ?? []),
    }));

    this.listeners = new Set();
    this.layerMap = new Map(this.layers.map((layer) => [layer.id, layer]));
    this.isDirty = false;
    this._writeLockDepth = 0;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event) {
    const listeners = [...this.listeners];
    for (const listener of listeners) {
      listener(event);
    }
  }

  getLayer(layerId) {
    return this.layerMap.get(layerId) ?? null;
  }

  getStoredLayerData(layerId) {
    const layer = this.getLayer(layerId);
    return layer?.data ?? null;
  }

  getTile(layerId, x, y) {
    const storedTileId = this.getStoredTile(layerId, x, y);
    if (storedTileId == null) return -1;

    return MapDocument.fromStoredTileId(storedTileId);
  }

  setTile(layerId, x, y, tileId) {
    return this.withWriteLock(() => (
      this.applyTileChanges(layerId, [{ x, y, tileId }])
    ));
  }

  applyTileChanges(layerId, changes) {
    this.assertWritable("applyTileChanges");

    const layer = this.getLayer(layerId);
    if (!layer || !Array.isArray(changes) || changes.length === 0) {
      return [];
    }

    const appliedChanges = [];

    for (const change of changes) {
      const index = this.getIndex(change.x, change.y);
      if (index < 0) continue;

      const nextStoredTileId = MapDocument.toStoredTileId(change.tileId);
      const prevStoredTileId = layer.data[index];
      if (prevStoredTileId === nextStoredTileId) continue;

      layer.data[index] = nextStoredTileId;
      appliedChanges.push({
        x: change.x,
        y: change.y,
        prevTileId: MapDocument.fromStoredTileId(prevStoredTileId),
        tileId: MapDocument.fromStoredTileId(nextStoredTileId),
      });
    }

    if (appliedChanges.length > 0) {
      this.isDirty = true;
      this.emit({
        type: "tilesChanged",
        document: this,
        layerId,
        changes: appliedChanges,
      });
    }

    return appliedChanges;
  }

  getIndex(x, y) {
    const { width, height } = this.meta;
    if (
      x == null ||
      y == null ||
      x < 0 ||
      y < 0 ||
      x >= width ||
      y >= height
    ) {
      return -1;
    }

    return y * width + x;
  }

  getStoredTile(layerId, x, y) {
    const layer = this.getLayer(layerId);
    const index = this.getIndex(x, y);
    if (!layer || index < 0) return null;

    return layer.data[index];
  }

  withWriteLock(mutator) {
    this._writeLockDepth += 1;

    try {
      return mutator();
    } finally {
      this._writeLockDepth -= 1;
    }
  }

  markClean() {
    this.isDirty = false;
  }

  assertWritable(operationName = "mutate document") {
    if (this._writeLockDepth > 0) {
      return;
    }

    const message = `MapDocument.${operationName}() must run inside withWriteLock()`;
    if (DEV) {
      throw new Error(message);
    }

    throw new Error(message);
  }

  static toStoredTileId(tileId) {
    return tileId == null || tileId < 0 ? EMPTY_STORED_TILE_ID : tileId;
  }

  static fromStoredTileId(storedTileId) {
    return storedTileId === EMPTY_STORED_TILE_ID ? -1 : storedTileId;
  }
}
