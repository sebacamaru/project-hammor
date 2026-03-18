export class LayerData {
  constructor(name, width, height) {
    this.name = name;
    this.width = width;
    this.height = height;
    this.data = new Int16Array(width * height);
    this.data.fill(-1);
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -1;
    return this.data[y * this.width + x];
  }

  set(x, y, value) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.data[y * this.width + x] = value;
  }

  fill(value) {
    this.data.fill(value);
  }
}
