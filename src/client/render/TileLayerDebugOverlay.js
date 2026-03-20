import { Container, Graphics } from "pixi.js";
import { TILE_SIZE } from "../../shared/core/Config.js";

export class TileLayerDebugOverlay {
  constructor(map, viewport, layerName, color) {
    this.map = map;
    this.viewport = viewport;
    this.layerName = layerName;
    this.color = color;
    this.enabled = false;
    this.offsetX = 0;
    this.offsetY = 0;
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
  }

  setOffset(offsetX, offsetY) {
    this.offsetX = offsetX;
    this.offsetY = offsetY;
  }

  render(camera, zoom = 1) {
    this.graphics.clear();
    if (!this.enabled) {
      this.container.visible = false;
      return;
    }
    this.container.visible = true;

    // Convert camera world-space to local tile coords for map queries
    const localStartX = Math.floor((camera.x - this.offsetX) / TILE_SIZE) - 1;
    const localStartY = Math.floor((camera.y - this.offsetY) / TILE_SIZE) - 1;
    const cols = Math.ceil(this.viewport.tilesX / zoom) + 2;
    const rows = Math.ceil(this.viewport.tilesY / zoom) + 2;

    for (let dy = 0; dy < rows; dy++) {
      for (let dx = 0; dx < cols; dx++) {
        const tx = localStartX + dx;
        const ty = localStartY + dy;
        const value = this.map.getTile(this.layerName, tx, ty);
        if (value < 0) continue;
        // Draw in world-space
        this.graphics.rect(this.offsetX + tx * TILE_SIZE, this.offsetY + ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
    this.graphics.fill({ color: this.color, alpha: 0.4 });
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
