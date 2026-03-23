import { Container, Graphics } from "pixi.js";

export class HitboxDebugOverlay {
  constructor() {
    this.enabled = false;
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
  }

  /**
   * Draws the player hitbox (cyan) and any solid entity hitboxes (yellow).
   * @param {object} entity - Local player entity with hitbox, x, y.
   * @param {{ id: string, x: number, y: number, hitbox: object }[]} entityHitboxes - Debug hitbox data from server snapshot.
   */
  render(entity, entityHitboxes = []) {
    this.graphics.clear();
    if (!this.enabled) {
      this.container.visible = false;
      return;
    }
    this.container.visible = true;

    // Player hitbox (cyan)
    const hb = entity.hitbox;
    this.graphics.rect(
      entity.x + hb.offsetX,
      entity.y + hb.offsetY,
      hb.width,
      hb.height
    );
    this.graphics.fill({ color: 0x00ffff, alpha: 0.5 });

    // Player feet crosshair (magenta)
    const cx = Math.floor(entity.x);
    const cy = Math.floor(entity.y);
    this.graphics.rect(cx - 2, cy, 5, 1);
    this.graphics.rect(cx, cy - 2, 1, 5);
    this.graphics.fill({ color: 0xff00ff, alpha: 1 });

    // Entity hitboxes (yellow)
    for (const eh of entityHitboxes) {
      this.graphics.rect(
        eh.x + eh.hitbox.offsetX,
        eh.y + eh.hitbox.offsetY,
        eh.hitbox.width,
        eh.hitbox.height
      );
    }
    if (entityHitboxes.length > 0) {
      this.graphics.fill({ color: 0xff0000, alpha: 0.5 });
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
