import { MapData } from "../models/MapData.js";
import { LayerData } from "../models/LayerData.js";

export class MapSerializer {
  /**
   * Serialize a MapData instance to a plain JSON-compatible object.
   * Layer data is stored as a regular array for JSON compatibility.
   */
  static serialize(mapData) {
    const layers = {};
    for (const [name, layer] of mapData.layers) {
      layers[name] = Array.from(layer.data);
    }
    return {
      width: mapData.width,
      height: mapData.height,
      layers,
    };
  }

  /**
   * Deserialize a plain object into a MapData instance.
   */
  static deserialize(obj) {
    const map = new MapData(obj.width, obj.height);
    for (const [name, data] of Object.entries(obj.layers)) {
      const layer = map.addLayer(name);
      layer.data.set(data);
    }
    return map;
  }
}
