import { MapLoader } from "../shared/data/loaders/MapLoader.js";
import { MapSerializer } from "../shared/data/serializers/MapSerializer.js";
import { MapValidator } from "../shared/data/validators/MapValidator.js";

/**
 * Handles loading and saving maps in the editor context.
 */
export class EditorMapService {
  async loadMap(url) {
    return await MapLoader.load(url);
  }

  exportMap(mapData) {
    const result = MapValidator.validate(mapData);
    if (!result.valid) {
      throw new Error(`Map validation failed: ${result.errors.join(", ")}`);
    }
    return MapSerializer.serialize(mapData);
  }
}
