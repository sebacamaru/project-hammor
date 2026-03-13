import { Container, Graphics } from "pixi.js";
import { TILE_SIZE, MAX_TILES_X, MAX_TILES_Y } from "../core/Config.js";

export class TilemapRenderer {
  /**
   * @param {import('../world/GameMap.js').GameMap} map
   * @param {import('../render/ViewportState.js').ViewportState} viewport
   */
  constructor(map, viewport) {
    this.map = map;
    this.viewport = viewport;
    this.container = new Container();
    this.pool = [];

    // Pre-allocate for the maximum possible viewport + 2 tile margin
    const cols = MAX_TILES_X + 2;
    const rows = MAX_TILES_Y + 2;

    for (let i = 0; i < cols * rows; i++) {
      const g = new Graphics();
      this.container.addChild(g);
      this.pool.push(g);
    }
  }

  render(camera) {
    const startX = Math.floor(camera.x / TILE_SIZE) - 1;
    const startY = Math.floor(camera.y / TILE_SIZE) - 1;
    const cols = this.viewport.tilesX + 2;
    const rows = this.viewport.tilesY + 2;
    let idx = 0;

    for (let dy = 0; dy < rows; dy++) {
      for (let dx = 0; dx < cols; dx++) {
        const tx = startX + dx;
        const ty = startY + dy;
        const g = this.pool[idx++];

        const tileId = this.map.getTile("ground", tx, ty);

        if (tileId < 0) {
          g.visible = false;
          continue;
        }

        g.visible = true;
        g.clear();
        g.rect(0, 0, TILE_SIZE, TILE_SIZE);
        g.fill(tileId === 1 ? 0x228b22 : 0x3a3a3a);
        g.x = tx * TILE_SIZE;
        g.y = ty * TILE_SIZE;
      }
    }

    // Hide any excess pool entries not used this frame
    for (let i = idx; i < this.pool.length; i++) {
      this.pool[i].visible = false;
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
