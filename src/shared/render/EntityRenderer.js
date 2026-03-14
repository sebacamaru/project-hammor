import { Container, Graphics } from "pixi.js";
import { AssetManager } from "../assets/AssetsManager.js";
import { Sprite } from "pixi.js";

export class EntityRenderer {
  constructor(parent) {
    this.container = new Container();
    parent.addChild(this.container);
    this.sprites = new Map();
  }

  sync(entities, alpha) {
    for (const entity of entities) {
      let sprite = this.sprites.get(entity.id);
      if (!sprite) {
        sprite = this._createSprite(entity);
        this.sprites.set(entity.id, sprite);
        this.container.addChild(sprite);
      }
      // Interpolated position
      sprite.x = Math.floor(entity.prevX + (entity.x - entity.prevX) * alpha);
      sprite.y = Math.floor(entity.prevY + (entity.y - entity.prevY) * alpha);
    }
  }

  remove(entityId) {
    const sprite = this.sprites.get(entityId);
    if (sprite) {
      this.container.removeChild(sprite);
      sprite.destroy();
      this.sprites.delete(entityId);
    }
  }

  destroy() {
    for (const sprite of this.sprites.values()) {
      sprite.destroy();
    }
    this.sprites.clear();
    this.container.destroy({ children: true });
  }

  _createSprite(entity) {
    const tex = AssetManager.texture(entity.type);
    if (tex) {
      return new Sprite(tex);
    }
    return this._placeholder();
  }

  _placeholder() {
    const g = new Graphics();
    g.rect(0, 0, 16, 16);
    g.fill(0xff0000);
    return g;
  }
}
