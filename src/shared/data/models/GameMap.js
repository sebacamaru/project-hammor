import { MapLoader } from "../loaders/MapLoader.js";

export class GameMap {
  static async load(mapUrl) {
    return MapLoader.load(mapUrl);
  }
}
