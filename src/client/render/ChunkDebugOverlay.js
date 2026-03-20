import { Container, Graphics } from "pixi.js";
import { TILE_SIZE } from "../../shared/core/Config.js";

export class ChunkDebugOverlay {
  constructor(map, viewport) {
    this.map = map;
    this.viewport = viewport;
    this.enabled = true;
    this.offsetX = 0;
    this.offsetY = 0;
    this.container = new Container();
    this.tileGraphics = new Graphics();
    this.chunkGraphics = new Graphics();
    this.container.addChild(this.tileGraphics);
    this.container.addChild(this.chunkGraphics);
  }

  setOffset(offsetX, offsetY) {
    this.offsetX = offsetX;
    this.offsetY = offsetY;
  }

  render(camera, zoom = 1) {
    this.tileGraphics.clear();
    this.chunkGraphics.clear();
    if (!this.enabled) {
      this.container.visible = false;
      return;
    }
    this.container.visible = true;

    const chunkPx = this.map.chunkSize * TILE_SIZE;
    const viewW = this.viewport.tilesX * TILE_SIZE / zoom;
    const viewH = this.viewport.tilesY * TILE_SIZE / zoom;

    // Map pixel bounds in world-space (offset by region origin)
    const mapLeft = this.offsetX;
    const mapTop = this.offsetY;
    const mapRight = this.offsetX + this.map.width * TILE_SIZE;
    const mapBottom = this.offsetY + this.map.height * TILE_SIZE;

    // Visible world rect with one tile margin
    const startX = camera.x - TILE_SIZE;
    const startY = camera.y - TILE_SIZE;
    const endX = camera.x + viewW + TILE_SIZE;
    const endY = camera.y + viewH + TILE_SIZE;

    // Clamp draw region to map world bounds
    const y0 = Math.max(mapTop, startY);
    const y1 = Math.min(mapBottom, endY);
    const x0 = Math.max(mapLeft, startX);
    const x1 = Math.min(mapRight, endX);
    const drawH = y1 - y0;
    const drawW = x1 - x0;

    // --- Tile grid (blue filled rects, 1px) ---
    // Convert to local tile range then draw in world-space
    const firstLocalCol = Math.floor((startX - this.offsetX) / TILE_SIZE);
    const lastLocalCol = Math.ceil((endX - this.offsetX) / TILE_SIZE);
    const firstLocalRow = Math.floor((startY - this.offsetY) / TILE_SIZE);
    const lastLocalRow = Math.ceil((endY - this.offsetY) / TILE_SIZE);

    for (let col = firstLocalCol; col <= lastLocalCol; col++) {
      const x = this.offsetX + col * TILE_SIZE;
      if (x < mapLeft || x >= mapRight) continue;
      this.tileGraphics.rect(x, y0, 1, drawH);
    }
    for (let row = firstLocalRow; row <= lastLocalRow; row++) {
      const y = this.offsetY + row * TILE_SIZE;
      if (y < mapTop || y >= mapBottom) continue;
      this.tileGraphics.rect(x0, y, drawW, 1);
    }
    this.tileGraphics.fill({ color: 0x4444ff, alpha: 0.3 });

    // --- Chunk boundaries (red filled rects, 2px) ---
    const firstLocalChunkCol = Math.floor((startX - this.offsetX) / chunkPx);
    const lastLocalChunkCol = Math.ceil((endX - this.offsetX) / chunkPx);
    const firstLocalChunkRow = Math.floor((startY - this.offsetY) / chunkPx);
    const lastLocalChunkRow = Math.ceil((endY - this.offsetY) / chunkPx);

    for (let col = firstLocalChunkCol; col <= lastLocalChunkCol; col++) {
      const x = this.offsetX + col * chunkPx;
      if (x < mapLeft || x > mapRight) continue;
      this.chunkGraphics.rect(x - 1, y0, 2, drawH);
    }
    for (let row = firstLocalChunkRow; row <= lastLocalChunkRow; row++) {
      const y = this.offsetY + row * chunkPx;
      if (y < mapTop || y > mapBottom) continue;
      this.chunkGraphics.rect(x0, y - 1, drawW, 2);
    }
    this.chunkGraphics.fill({ color: 0xff0000, alpha: 0.8 });
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
