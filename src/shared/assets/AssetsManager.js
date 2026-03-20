import { Assets } from "pixi.js";
import { manifest } from "./AssetManifest.js";

export class AssetManager {
  static _initialized = false;

  static async init() {
    if (AssetManager._initialized) return;
    await Assets.init({
      manifest,
    });
    AssetManager._initialized = true;
  }

  static async loadBundle(name) {
    return await Assets.loadBundle(name);
  }

  static get(alias) {
    return Assets.get(alias);
  }

  static texture(name) {
    return Assets.get(name);
  }
}
