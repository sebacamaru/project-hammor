export class VisibleChunkTracker {
  constructor(chunkSize, tileSize) {
    this.chunkSize = chunkSize;
    this.tileSize = tileSize;
    this._previous = new Set();
  }

  update(cameraX, cameraY, viewW, viewH) {
    const chunkPx = this.chunkSize * this.tileSize;
    const startCx = Math.floor(cameraX / chunkPx);
    const startCy = Math.floor(cameraY / chunkPx);
    const endCx = Math.floor((cameraX + viewW) / chunkPx);
    const endCy = Math.floor((cameraY + viewH) / chunkPx);

    const visible = new Set();
    for (let cy = startCy; cy <= endCy; cy++) {
      for (let cx = startCx; cx <= endCx; cx++) {
        visible.add(`${cx},${cy}`);
      }
    }

    const entered = [];
    for (const key of visible) {
      if (!this._previous.has(key)) entered.push(key);
    }

    const exited = [];
    for (const key of this._previous) {
      if (!visible.has(key)) exited.push(key);
    }

    this._previous = visible;
    return { entered, exited, visible };
  }

  reset() {
    this._previous.clear();
  }
}
