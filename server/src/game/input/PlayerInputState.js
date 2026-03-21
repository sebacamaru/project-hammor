export class PlayerInputState {
  constructor() {
    this.seq = -1;
    this.up = false;
    this.down = false;
    this.left = false;
    this.right = false;
  }

  apply(seq, input) {
    this.seq = seq;
    this.up = input.up;
    this.down = input.down;
    this.left = input.left;
    this.right = input.right;
  }
}
