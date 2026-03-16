import { Assets, Container, Texture, Rectangle } from "pixi.js";
import { ChunkLayerView } from "./ChunkLayerView.js";

export class MapChunkRenderer {
  /**
   * @param {import('../data/models/MapData.js').MapData} map
   * @param {import('./ViewportState.js').ViewportState} viewport
   * @param {string[]} layerNames
   */
  constructor(map, viewport, layerNames) {
    this.map = map;
    this.viewport = viewport;
    this.layerNames = layerNames;

    // Tileset info + texture cache
    const tileset = map.tileset;
    this.columns = tileset.columns;
    this.tileSize = tileset.tileSize;
    this.baseTexture = Assets.get(tileset.image);
    this.tileTextures = new Map();
    this._boundGetTexture = this._getTileTexture.bind(this);

    // One container per layer for z-order interleaving
    /** @type {Map<string, Container>} */
    this.layerContainers = new Map();
    for (const name of layerNames) {
      this.layerContainers.set(name, new Container());
    }

    // Chunk views keyed by "cx,cy,layerName"
    /** @type {Map<string, ChunkLayerView>} */
    this.chunkViews = new Map();

    // Track which chunk+layer combos were checked and found empty
    /** @type {Set<string>} */
    this._emptyKeys = new Set();
  }

  _getTileTexture(tileId) {
    let tex = this.tileTextures.get(tileId);
    if (tex) return tex;

    const atlasIndex = tileId - 1;
    const tileX = atlasIndex % this.columns;
    const tileY = Math.floor(atlasIndex / this.columns);

    tex = new Texture({
      source: this.baseTexture.source,
      frame: new Rectangle(
        tileX * this.tileSize,
        tileY * this.tileSize,
        this.tileSize,
        this.tileSize
      ),
    });

    this.tileTextures.set(tileId, tex);
    return tex;
  }

  _viewKey(cx, cy, layerName) {
    return `${cx},${cy},${layerName}`;
  }

  getLayerContainer(layerName) {
    return this.layerContainers.get(layerName);
  }

  update(camera) {
    const chunkPx = this.map.chunkSize * this.map.tileSize;
    const startCx = Math.floor(camera.x / chunkPx);
    const startCy = Math.floor(camera.y / chunkPx);
    const endCx = Math.floor((camera.x + this.viewport.tilesX * this.map.tileSize) / chunkPx);
    const endCy = Math.floor((camera.y + this.viewport.tilesY * this.map.tileSize) / chunkPx);

    // Track which views are visible this frame
    const visibleKeys = new Set();

    for (let cy = startCy; cy <= endCy; cy++) {
      for (let cx = startCx; cx <= endCx; cx++) {
        const chunk = this.map.getChunk(cx, cy);
        if (!chunk) continue;

        for (const layerName of this.layerNames) {
          const key = this._viewKey(cx, cy, layerName);
          visibleKeys.add(key);

          // Already created — just make visible
          if (this.chunkViews.has(key)) {
            this.chunkViews.get(key).container.visible = true;
            continue;
          }

          // Already checked and was empty
          if (this._emptyKeys.has(key)) continue;

          // Check if layer has any content
          const layer = chunk.getLayer(layerName);
          if (!layer || !layer.some(v => v > 0)) {
            this._emptyKeys.add(key);
            continue;
          }

          // Create new view
          const view = new ChunkLayerView(chunk, layerName, this.tileSize, this._boundGetTexture);
          this.chunkViews.set(key, view);
          this.layerContainers.get(layerName).addChild(view.container);
        }
      }
    }

    // Hide non-visible chunk views
    for (const [key, view] of this.chunkViews) {
      if (!visibleKeys.has(key)) {
        view.container.visible = false;
      }
    }
  }

  rebuildChunk(cx, cy) {
    const chunk = this.map.getChunk(cx, cy);

    for (const layerName of this.layerNames) {
      const key = this._viewKey(cx, cy, layerName);

      // Clear empty flag so it gets re-checked
      this._emptyKeys.delete(key);

      const layer = chunk?.getLayer(layerName);
      const hasContent = layer && layer.some(v => v > 0);

      const existing = this.chunkViews.get(key);
      if (existing) {
        if (hasContent) {
          existing.rebuild();
        } else {
          // Layer became empty — remove the view
          existing.destroy();
          this.chunkViews.delete(key);
          this._emptyKeys.add(key);
        }
      } else if (hasContent) {
        // Layer became non-empty — create new view
        const view = new ChunkLayerView(chunk, layerName, this.tileSize, this._boundGetTexture);
        this.chunkViews.set(key, view);
        this.layerContainers.get(layerName).addChild(view.container);
      }
    }
  }

  destroy() {
    for (const view of this.chunkViews.values()) {
      view.destroy();
    }
    this.chunkViews.clear();
    for (const container of this.layerContainers.values()) {
      container.destroy({ children: true });
    }
    this.layerContainers.clear();
  }
}
