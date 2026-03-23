import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const PREFABS_DIR = join(process.cwd(), "content", "prefabs", "entities");

/**
 * Loads and caches entity prefab JSON files from content/prefabs/entities/.
 * Each prefab defines a reusable template with kind, components, and default params.
 * Follows the same caching pattern as RuntimeMapManager/RuntimeWorldManager.
 */
export class PrefabRegistry {
  constructor() {
    /** @type {Map<string, object>} prefabId → parsed prefab data */
    this._prefabs = new Map();
  }

  /**
   * Scans content/prefabs/entities/ and loads all .json files.
   * Gracefully handles missing directory (0 prefabs loaded).
   * Validates each prefab and skips invalid ones with a warning.
   * @returns {Promise<number>} Number of prefabs loaded.
   */
  async loadAll() {
    let files;
    try {
      files = await readdir(PREFABS_DIR);
    } catch (err) {
      if (err.code === "ENOENT") {
        // Directory doesn't exist yet — that's fine
        return 0;
      }
      throw err;
    }

    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    for (const file of jsonFiles) {
      const filePath = join(PREFABS_DIR, file);
      try {
        const raw = await readFile(filePath, "utf-8");
        const prefab = JSON.parse(raw);
        const error = this._validate(prefab, file);
        if (error) {
          console.warn(`[PrefabRegistry] Skipping "${file}": ${error}`);
          continue;
        }
        if (this._prefabs.has(prefab.id)) {
          console.warn(
            `[PrefabRegistry] Duplicate prefab id "${prefab.id}" in "${file}" — skipping`,
          );
          continue;
        }
        this._prefabs.set(prefab.id, prefab);
      } catch (err) {
        console.warn(
          `[PrefabRegistry] Failed to load "${file}": ${err.message}`,
        );
      }
    }

    return this._prefabs.size;
  }

  /**
   * Returns a prefab by id, or undefined if not loaded.
   * @param {string} prefabId
   * @returns {object|undefined}
   */
  getPrefab(prefabId) {
    return this._prefabs.get(prefabId);
  }

  /**
   * Checks whether a prefab with the given id is loaded.
   * @param {string} prefabId
   * @returns {boolean}
   */
  has(prefabId) {
    return this._prefabs.has(prefabId);
  }

  /**
   * Returns the total number of loaded prefabs.
   * @returns {number}
   */
  count() {
    return this._prefabs.size;
  }

  /**
   * Validates a parsed prefab object.
   * @param {object} prefab
   * @param {string} fileName - For error messages.
   * @returns {string|null} Error message, or null if valid.
   */
  _validate(prefab, fileName) {
    if (!prefab || typeof prefab !== "object") {
      return "not a valid JSON object";
    }
    if (!prefab.id || typeof prefab.id !== "string") {
      return "missing or invalid 'id'";
    }
    if (!prefab.kind || typeof prefab.kind !== "string") {
      return "missing or invalid 'kind'";
    }
    if (
      prefab.components !== undefined &&
      (typeof prefab.components !== "object" || prefab.components === null)
    ) {
      return "'components' must be an object";
    }
    if (
      prefab.params !== undefined &&
      (typeof prefab.params !== "object" || prefab.params === null)
    ) {
      return "'params' must be an object";
    }
    return null;
  }
}
