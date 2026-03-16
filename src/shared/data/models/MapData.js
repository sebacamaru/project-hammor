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
    if (!this.isInside(x, y)) return 0;
    const { cx, cy, localX, localY } = this.worldToChunk(x, y);
    const chunk = this.getChunk(cx, cy);
    if (!chunk) return 0;
    return chunk.getTile(layerName, localX, localY);
  }

  setTile(layerName, x, y, value) {
    if (!this.isInside(x, y)) return;
    const { cx, cy, localX, localY } = this.worldToChunk(x, y);
    const chunk = this.getOrCreateChunk(cx, cy);
    chunk.setTile(layerName, localX, localY, value);
  }
}
