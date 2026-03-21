import { PlayerInputState } from "../input/PlayerInputState.js";

export class ServerPlayer {
  constructor(id, x, y) {
    this.id = id;
    this.type = "player";
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = "down";
    this.input = new PlayerInputState();
  }

  toData() {
    return {
      id: this.id,
      type: this.type,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      facing: this.facing,
    };
  }
}
