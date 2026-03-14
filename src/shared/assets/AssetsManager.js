import { Assets } from "pixi.js";
import { manifest } from "./AssetManifest.js";

export class AssetManager {
  static async init() {
    await Assets.init({
      manifest,
    });
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
