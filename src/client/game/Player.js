import { Entity } from "../../shared/data/models/Entity.js";

export class Player extends Entity {
  constructor(x, y) {
    super(x, y);
    this.type = "player";
    this.speed = 2;
    this.moving = false;
    this.hitbox = { offsetX: 4, offsetY: 12, width: 8, height: 4 };
  }

  update(dt, input, collides) {
    super.update(dt);

    let dx = 0;
    let dy = 0;

    if (input.held("ArrowUp") || input.held("KeyW")) {
      dy = -1;
      this.direction = 3;
    }
    if (input.held("ArrowDown") || input.held("KeyS")) {
      dy = 1;
      this.direction = 0;
    }
    if (input.held("ArrowLeft") || input.held("KeyA")) {
      dx = -1;
      this.direction = 1;
    }
    if (input.held("ArrowRight") || input.held("KeyD")) {
      dx = 1;
      this.direction = 2;
    }

    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.SQRT2;
      dx *= inv;
      dy *= inv;
    }

    this.moving = dx !== 0 || dy !== 0;

    const oldX = this.worldX;
    const oldY = this.worldY;

    // Resolve X
    this.worldX += dx * this.speed;
    if (collides(this.worldX, this.worldY, this.hitbox)) {
      this.worldX = oldX;
    }

    // Resolve Y
    this.worldY += dy * this.speed;
    if (collides(this.worldX, this.worldY, this.hitbox)) {
      this.worldY = oldY;
    }

    this.syncLocalFromWorld();
  }
}
