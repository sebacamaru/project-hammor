let nextId = 1;

export class Entity {
  constructor(x, y) {
    this.id = nextId++;
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.worldX = x;
    this.worldY = y;
    this.prevWorldX = x;
    this.prevWorldY = y;
    this.direction = 0; // 0=down, 1=left, 2=right, 3=up
    this.speed = 2;
    this.type = "entity";
  }

  update(dt) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevWorldX = this.worldX;
    this.prevWorldY = this.worldY;
  }

  syncLocalFromWorld() {
    this.x = this.worldX;
    this.y = this.worldY;
  }
}
