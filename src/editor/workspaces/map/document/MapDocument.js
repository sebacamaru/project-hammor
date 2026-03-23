// Internally the editor stores layer data in Uint16Array. Because Uint16Array
// cannot represent -1, we reserve the max uint16 value as the empty sentinel.
import { snapWorldToFeet } from "../../../../shared/core/TileMath.js";

const EMPTY_STORED_TILE_ID = 0xffff;
const DEV = import.meta.env?.DEV ?? false;

export class MapDocument {
  static EMPTY_STORED_TILE_ID = EMPTY_STORED_TILE_ID;

  /**
   * @param {object} meta - Map metadata (id, width, height, tileSize, chunkSize, tileset, etc.)
   * @param {Array} layers - Layer definitions with id, kind, visible, data (Uint16Array or plain array)
   * @param {Array} entities - Opaque entity data array (passthrough, not parsed by the editor)
   */
  constructor(meta = {}, layers = [], entities = []) {
    this.meta = { ...meta };
    this.layers = layers.map((layer) => ({
      id: layer.id,
      kind: layer.kind ?? layer.id,
      visible: layer.visible ?? true,
      data: layer.data instanceof Uint16Array
        ? new Uint16Array(layer.data)
        : Uint16Array.from(layer.data ?? []),
    }));

    /** @type {Array<object>} Opaque entity instances — preserved through load/save unchanged. */
    this.entities = Array.isArray(entities) ? [...entities] : [];

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

  /**
   * Appends an entity to the entities array and emits an entitiesChanged event.
   * @param {object} entity
   */
  addEntity(entity) {
    const tileSize = this.meta.tileSize ?? 16;
    const { x, y } = snapWorldToFeet(entity.x, entity.y, tileSize);
    entity.x = x;
    entity.y = y;

    this.entities.push(entity);
    this.isDirty = true;
    this.emit({ type: "entitiesChanged", document: this });
  }

  /**
   * Removes the entity with the given id from the entities array.
   * Emits entitiesChanged if the entity was found and removed.
   * @param {string} id
   * @returns {boolean} true if entity was found and removed
   */
  removeEntity(id) {
    const index = this.entities.findIndex((e) => e.id === id);
    if (index === -1) return false;
    this.entities.splice(index, 1);
    this.isDirty = true;
    this.emit({ type: "entitiesChanged", document: this });
    return true;
  }

  /**
   * Applies a shallow merge of patch onto the entity with the given id.
   * Emits entitiesChanged if the entity was found.
   * @param {string} id
   * @param {object} patch — top-level entity fields to merge (e.g. { id, prefab, components })
   * @returns {boolean} true if entity was found and updated
   */
  updateEntity(id, patch) {
    const entity = this.entities.find((e) => e.id === id);
    if (!entity) return false;
    Object.assign(entity, patch);
    this.isDirty = true;
    this.emit({ type: "entitiesChanged", document: this });
    return true;
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
