import { Container, Graphics } from "pixi.js";

export class HitboxDebugOverlay {
  constructor() {
    this.enabled = false;
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
  }

  render(entity) {
    this.graphics.clear();
    if (!this.enabled) {
      this.container.visible = false;
      return;
    }
    this.container.visible = true;

    const hb = entity.hitbox;
    this.graphics.rect(
      entity.x + hb.offsetX,
      entity.y + hb.offsetY,
      hb.width,
      hb.height
    );
    this.graphics.fill({ color: 0x00ffff, alpha: 0.5 });

    // Crosshair at exact authoritative position (x, y = top-left, where server checks collision)
    const cx = Math.floor(entity.x);
    const cy = Math.floor(entity.y);
    this.graphics.rect(cx - 2, cy, 5, 1);
    this.graphics.rect(cx, cy - 2, 1, 5);
    this.graphics.fill({ color: 0xff00ff, alpha: 1 });
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
