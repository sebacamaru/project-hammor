import { LayerData } from "./LayerData.js";

export class MapData {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    /** @type {Map<string, LayerData>} */
    this.layers = new Map();
  }

  addLayer(name) {
    const layer = new LayerData(name, this.width, this.height);
    this.layers.set(name, layer);
    return layer;
  }

  getLayer(name) {
    return this.layers.get(name) ?? null;
  }

  getTile(layerName, x, y) {
    const layer = this.layers.get(layerName);
    if (!layer) return -1;
    return layer.get(x, y);
  }

  setTile(layerName, x, y, value) {
    const layer = this.layers.get(layerName);
    if (!layer) return;
    layer.set(x, y, value);
  }
}
