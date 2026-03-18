export class ChunkData {
  constructor(cx, cy, chunkSize, layerNames) {
    this.cx = cx;
    this.cy = cy;
    this.chunkSize = chunkSize;
    /** @type {Map<string, Int16Array>} */
    this.layers = new Map();
    for (const name of layerNames) {
      const arr = new Int16Array(chunkSize * chunkSize);
      arr.fill(-1);
      this.layers.set(name, arr);
    }
  }

  getTile(layerName, localX, localY) {
    const layer = this.layers.get(layerName);
    if (!layer || localX < 0 || localY < 0 || localX >= this.chunkSize || localY >= this.chunkSize) return -1;
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
