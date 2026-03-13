export class GameMap {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.layers = {
      ground: new Uint16Array(width * height),
    };
    this.generateTest();
  }

  generateTest() {
    const ground = this.layers.ground;
    for (let i = 0; i < ground.length; i++) {
      ground[i] = Math.random() > 0.8 ? 1 : 0;
    }
  }

  getTile(layer, x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -1;
    return this.layers[layer][y * this.width + x];
  }
}
