import { MapSerializer } from "../serializers/MapSerializer.js";

/**
 * Loads map data from a JSON URL (browser context via fetch).
 */
export class MapLoader {
  static async load(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load map from ${url}: ${response.status}`);
    }
    const json = await response.json();
    return MapSerializer.deserialize(json);
  }
}
