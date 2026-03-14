import { readFile } from "node:fs/promises";
import { MapSerializer } from "../../shared/data/serializers/MapSerializer.js";

/**
 * Loads map JSON files from the filesystem (Node.js context).
 */
export class ServerMapLoader {
  static async load(filePath) {
    const raw = await readFile(filePath, "utf-8");
    const json = JSON.parse(raw);
    return MapSerializer.deserialize(json);
  }
}
