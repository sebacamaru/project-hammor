import { Assets, Container, Sprite, Texture, Rectangle } from "pixi.js";
import { TILE_SIZE, MAX_TILES_X, MAX_TILES_Y } from "../core/Config.js";

export class TilemapRenderer {
  /**
   * @param {import('../data/models/MapData.js').MapData} map
   * @param {import('./ViewportState.js').ViewportState} viewport
   */
  constructor(map, viewport, layerName) {
    this.map = map;
    this.viewport = viewport;
    this.layerName = layerName;
    this.container = new Container();
    this.pool = [];

    // Tileset info
    const tileset = map.tileset;
    this.columns = tileset.columns;
    this.tileSize = tileset.tileSize;
    this.baseTexture = Assets.get(tileset.image);
    this.tileTextures = new Map();

    // Pre-allocate sprite pool for maximum viewport + 2 tile margin
    const cols = MAX_TILES_X + 2;
    const rows = MAX_TILES_Y + 2;

    for (let i = 0; i < cols * rows; i++) {
      const sprite = new Sprite();
      sprite.visible = false;
      this.container.addChild(sprite);
      this.pool.push(sprite);
    }
  }

  _getTileTexture(tileId) {
    let tex = this.tileTextures.get(tileId);
    if (tex) return tex;

    const atlasIndex = tileId;
    const tileX = atlasIndex % this.columns;
    const tileY = Math.floor(atlasIndex / this.columns);

    tex = new Texture({
      source: this.baseTexture.source,
      frame: new Rectangle(
        tileX * this.tileSize,
        tileY * this.tileSize,
        this.tileSize,
        this.tileSize
      ),
    });

    this.tileTextures.set(tileId, tex);
    return tex;
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
        const sprite = this.pool[idx++];

        const tileId = this.map.getTile(this.layerName, tx, ty);

        if (tileId < 0) {
          sprite.visible = false;
          continue;
        }

        sprite.visible = true;
        sprite.texture = this._getTileTexture(tileId);
        sprite.x = tx * TILE_SIZE;
        sprite.y = ty * TILE_SIZE;
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
