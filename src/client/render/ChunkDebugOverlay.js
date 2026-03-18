import { Container, Graphics } from "pixi.js";
import { TILE_SIZE } from "../../shared/core/Config.js";

export class ChunkDebugOverlay {
  constructor(map, viewport) {
    this.map = map;
    this.viewport = viewport;
    this.enabled = true;
    this.container = new Container();
    this.tileGraphics = new Graphics();
    this.chunkGraphics = new Graphics();
    this.container.addChild(this.tileGraphics);
    this.container.addChild(this.chunkGraphics);
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

    // Map pixel bounds
    const mapW = this.map.width * TILE_SIZE;
    const mapH = this.map.height * TILE_SIZE;

    // Visible world rect with one tile margin
    const startX = camera.x - TILE_SIZE;
    const startY = camera.y - TILE_SIZE;
    const endX = camera.x + viewW + TILE_SIZE;
    const endY = camera.y + viewH + TILE_SIZE;

    // Clamp draw region to map bounds
    const y0 = Math.max(0, startY);
    const y1 = Math.min(mapH, endY);
    const x0 = Math.max(0, startX);
    const x1 = Math.min(mapW, endX);
    const drawH = y1 - y0;
    const drawW = x1 - x0;

    // --- Tile grid (blue filled rects, 1px) ---
    const firstTileCol = Math.floor(startX / TILE_SIZE);
    const lastTileCol = Math.ceil(endX / TILE_SIZE);
    const firstTileRow = Math.floor(startY / TILE_SIZE);
    const lastTileRow = Math.ceil(endY / TILE_SIZE);

    for (let col = firstTileCol; col <= lastTileCol; col++) {
      const x = col * TILE_SIZE;
      if (x < 0 || x >= mapW) continue;
      this.tileGraphics.rect(x, y0, 1, drawH);
    }
    for (let row = firstTileRow; row <= lastTileRow; row++) {
      const y = row * TILE_SIZE;
      if (y < 0 || y >= mapH) continue;
      this.tileGraphics.rect(x0, y, drawW, 1);
    }
    this.tileGraphics.fill({ color: 0x4444ff, alpha: 0.3 });

    // --- Chunk boundaries (red filled rects, 2px) ---
    const firstChunkCol = Math.floor(startX / chunkPx);
    const lastChunkCol = Math.ceil(endX / chunkPx);
    const firstChunkRow = Math.floor(startY / chunkPx);
    const lastChunkRow = Math.ceil(endY / chunkPx);

    for (let col = firstChunkCol; col <= lastChunkCol; col++) {
      const x = col * chunkPx;
      if (x < 0 || x > mapW) continue;
      this.chunkGraphics.rect(x - 1, y0, 2, drawH);
    }
    for (let row = firstChunkRow; row <= lastChunkRow; row++) {
      const y = row * chunkPx;
      if (y < 0 || y > mapH) continue;
      this.chunkGraphics.rect(x0, y - 1, drawW, 2);
    }
    this.chunkGraphics.fill({ color: 0xff0000, alpha: 0.8 });
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
