import { ChunkData } from "./ChunkData.js";

export class MapData {
  constructor(width, height, tileSize, chunkSize, layerNames) {
    this.id = null;
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
    this.chunkSize = chunkSize;
    this.tilesetId = null;
    this.tileset = null;
    this.layerNames = layerNames;
    /** @type {Map<string, ChunkData>} */
    this.chunks = new Map();

    // Dirty tracking
    /** @type {Set<string>} chunk keys that changed since last consume */
    this.dirtyChunks = new Set();
    /** @type {Map<string, Set<string>>} chunk key → set of dirty layer names */
    this.dirtyLayersByChunk = new Map();
  }

  // Minimal compat: old MapSerializer/MapValidator iterate mapData.layers
  get layers() {
    return new Map();
  }

  getChunkKey(cx, cy) {
    return `${cx},${cy}`;
  }

  getChunk(cx, cy) {
    return this.chunks.get(this.getChunkKey(cx, cy)) ?? null;
  }

  createChunk(cx, cy) {
    const key = this.getChunkKey(cx, cy);
    const chunk = new ChunkData(cx, cy, this.chunkSize, this.layerNames);
    this.chunks.set(key, chunk);
    return chunk;
  }

  getOrCreateChunk(cx, cy) {
    return this.getChunk(cx, cy) ?? this.createChunk(cx, cy);
  }

  worldToChunk(x, y) {
    const cx = Math.floor(x / this.chunkSize);
    const cy = Math.floor(y / this.chunkSize);
    const localX = x - cx * this.chunkSize;
    const localY = y - cy * this.chunkSize;
    return { cx, cy, localX, localY };
  }

  isInside(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  getTile(layerName, x, y) {
    if (!this.isInside(x, y)) return -1;
    const { cx, cy, localX, localY } = this.worldToChunk(x, y);
    const chunk = this.getChunk(cx, cy);
    if (!chunk) return -1;
    return chunk.getTile(layerName, localX, localY);
  }

  /**
   * Sets a tile value. Returns change metadata or null if no change occurred.
   * @returns {{ cx: number, cy: number, layerName: string, x: number, y: number, prev: number, value: number } | null}
   */
  setTile(layerName, x, y, value) {
    if (!this.isInside(x, y)) return null;
    const { cx, cy, localX, localY } = this.worldToChunk(x, y);
    const chunk = this.getOrCreateChunk(cx, cy);
    const prev = chunk.getTile(layerName, localX, localY);
    if (prev === value) return null;
    chunk.setTile(layerName, localX, localY, value);
    this.markChunkDirty(cx, cy, layerName);
    return { cx, cy, layerName, x, y, prev, value };
  }

  // --- Dirty tracking ---

  markChunkDirty(cx, cy, layerName) {
    const key = this.getChunkKey(cx, cy);
    this.dirtyChunks.add(key);
    if (layerName != null) {
      let layers = this.dirtyLayersByChunk.get(key);
      if (!layers) {
        layers = new Set();
        this.dirtyLayersByChunk.set(key, layers);
      }
      layers.add(layerName);
    }
  }

  isChunkDirty(cx, cy) {
    return this.dirtyChunks.has(this.getChunkKey(cx, cy));
  }

  clearChunkDirty(cx, cy) {
    const key = this.getChunkKey(cx, cy);
    this.dirtyChunks.delete(key);
    this.dirtyLayersByChunk.delete(key);
  }

  clearAllDirty() {
    this.dirtyChunks.clear();
    this.dirtyLayersByChunk.clear();
  }

  /**
   * Returns cloned dirty state and clears internal tracking.
   * @returns {{ dirtyChunks: Set<string>, dirtyLayers: Map<string, Set<string>> }}
   */
  consumeDirtyChunks() {
    const chunks = new Set(this.dirtyChunks);
    const layers = new Map();
    for (const [key, layerSet] of this.dirtyLayersByChunk) {
      layers.set(key, new Set(layerSet));
    }
    this.clearAllDirty();
    return { dirtyChunks: chunks, dirtyLayers: layers };
  }

  markAllDirty() {
    for (const key of this.chunks.keys()) {
      this.dirtyChunks.add(key);
      this.dirtyLayersByChunk.set(key, new Set(this.layerNames));
    }
  }
}
