import { Container, Sprite } from "pixi.js";

export class ChunkLayerView {
  /**
   * @param {import('../data/models/ChunkData.js').ChunkData} chunkData
   * @param {string} layerName
   * @param {number} tileSize
   * @param {(tileId: number) => import('pixi.js').Texture} tileTextureFn
   */
  constructor(chunkData, layerName, tileSize, tileTextureFn) {
    this.chunkData = chunkData;
    this.layerName = layerName;
    this.tileSize = tileSize;
    this.tileTextureFn = tileTextureFn;

    this.container = new Container();
    this.container.x = chunkData.cx * chunkData.chunkSize * tileSize;
    this.container.y = chunkData.cy * chunkData.chunkSize * tileSize;

    this._buildSprites();
  }

  _buildSprites() {
    const layer = this.chunkData.getLayer(this.layerName);
    if (!layer) return;

    const size = this.chunkData.chunkSize;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const tileId = layer[y * size + x];
        if (tileId < 0) continue;

        const sprite = new Sprite(this.tileTextureFn(tileId));
        sprite.x = x * this.tileSize;
        sprite.y = y * this.tileSize;
        this.container.addChild(sprite);
      }
    }
  }

  rebuild() {
    this.container.removeChildren();
    this._buildSprites();
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
