export class MapValidator {
  /**
   * Validates a MapData instance.
   * @param {import('../models/MapData.js').MapData} mapData
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validate(mapData) {
    const errors = [];

    if (!mapData) {
      return { valid: false, errors: ["MapData is null or undefined"] };
    }

    if (mapData.width <= 0 || mapData.height <= 0) {
      errors.push(`Invalid dimensions: ${mapData.width}x${mapData.height}`);
    }

    for (const [name, layer] of mapData.layers) {
      const expected = mapData.width * mapData.height;
      if (layer.data.length !== expected) {
        errors.push(
          `Layer "${name}" has ${layer.data.length} tiles, expected ${expected}`,
        );
      }
      if (layer.width !== mapData.width || layer.height !== mapData.height) {
        errors.push(
          `Layer "${name}" dimensions (${layer.width}x${layer.height}) don't match map (${mapData.width}x${mapData.height})`,
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
