import { Container, Graphics } from "pixi.js";
import { TILE_SIZE } from "../../shared/core/Config.js";

export class TileLayerDebugOverlay {
  constructor(map, viewport, layerName, color) {
    this.map = map;
    this.viewport = viewport;
    this.layerName = layerName;
    this.color = color;
    this.enabled = false;
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
  }

  render(camera, zoom = 1) {
    this.graphics.clear();
    if (!this.enabled) {
      this.container.visible = false;
      return;
    }
    this.container.visible = true;

    const startX = Math.floor(camera.x / TILE_SIZE) - 1;
    const startY = Math.floor(camera.y / TILE_SIZE) - 1;
    const cols = Math.ceil(this.viewport.tilesX / zoom) + 2;
    const rows = Math.ceil(this.viewport.tilesY / zoom) + 2;

    for (let dy = 0; dy < rows; dy++) {
      for (let dx = 0; dx < cols; dx++) {
        const tx = startX + dx;
        const ty = startY + dy;
        const value = this.map.getTile(this.layerName, tx, ty);
        if (value < 0) continue;
        this.graphics.rect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
    this.graphics.fill({ color: this.color, alpha: 0.4 });
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
