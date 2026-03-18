export class TilesetRegistry {
  static cache = new Map();

  static async load(tilesetId) {
    if (!tilesetId) {
      throw new Error("TilesetRegistry.load() requires a tileset id");
    }

    if (this.cache.has(tilesetId)) {
      return this.cache.get(tilesetId);
    }

    const response = await fetch(`/content/tilesets/${tilesetId}_tileset.json`);
    if (!response.ok) {
      throw new Error(`Failed to load tileset "${tilesetId}": ${response.status}`);
    }

    const tileset = this.normalize(await response.json(), tilesetId);
    this.cache.set(tilesetId, tileset);
    return tileset;
  }

  static normalize(tileset, requestedId) {
    if (!tileset?.image) {
      throw new Error(`Tileset "${requestedId}" is missing required field "image"`);
    }
    if (typeof tileset.tileSize !== "number") {
      throw new Error(`Tileset "${requestedId}" is missing required field "tileSize"`);
    }
    if (typeof tileset.columns !== "number") {
      throw new Error(`Tileset "${requestedId}" is missing required field "columns"`);
    }

    return {
      ...tileset,
      editor: {
        ...tileset.editor,
        groups: Array.isArray(tileset.editor?.groups) ? tileset.editor.groups : [],
      },
    };
  }
}
