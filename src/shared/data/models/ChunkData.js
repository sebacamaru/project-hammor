export class ChunkData {
  constructor(cx, cy, chunkSize, layerNames) {
    this.cx = cx;
    this.cy = cy;
    this.chunkSize = chunkSize;
    /** @type {Map<string, Uint16Array>} */
    this.layers = new Map();
    for (const name of layerNames) {
      this.layers.set(name, new Uint16Array(chunkSize * chunkSize));
    }
  }

  getTile(layerName, localX, localY) {
    const layer = this.layers.get(layerName);
    if (!layer || localX < 0 || localY < 0 || localX >= this.chunkSize || localY >= this.chunkSize) return 0;
    return layer[localY * this.chunkSize + localX];
  }

  setTile(layerName, localX, localY, value) {
    const layer = this.layers.get(layerName);
    if (!layer || localX < 0 || localY < 0 || localX >= this.chunkSize || localY >= this.chunkSize) return;
    layer[localY * this.chunkSize + localX] = value;
  }

  getLayer(layerName) {
    return this.layers.get(layerName) ?? null;
  }
}
