import { Assets, Container, Texture, Rectangle } from "pixi.js";
import { ChunkLayerView } from "./ChunkLayerView.js";
import { VisibleChunkTracker } from "./VisibleChunkTracker.js";

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

    this._chunkTracker = new VisibleChunkTracker(map.chunkSize, map.tileSize);

    // Last streaming diff (for debug overlay)
    this._lastVisible = new Set();
    this._lastEntered = [];
    this._lastExited = [];
  }

  _getTileTexture(tileId) {
    let tex = this.tileTextures.get(tileId);
    if (tex) return tex;

    const atlasIndex = tileId;
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

  update(camera, zoom = 1) {
    const visibleW = this.viewport.tilesX * this.map.tileSize / zoom;
    const visibleH = this.viewport.tilesY * this.map.tileSize / zoom;

    const { entered, exited, visible } = this._chunkTracker.update(
      camera.x, camera.y, visibleW, visibleH
    );

    this._lastVisible = visible;
    this._lastEntered = entered;
    this._lastExited = exited;

    // Mount chunks that entered the viewport
    for (const chunkKey of entered) {
      const [cxStr, cyStr] = chunkKey.split(",");
      const cx = +cxStr;
      const cy = +cyStr;

      const chunk = this.map.getChunk(cx, cy);
      if (!chunk) continue;

      for (const layerName of this.layerNames) {
        const key = this._viewKey(cx, cy, layerName);

        // Already cached as empty content — skip
        if (this._emptyKeys.has(key)) continue;

        // Check if layer has any content
        const layer = chunk.getLayer(layerName);
        if (!layer || !layer.some(v => v >= 0)) {
          this._emptyKeys.add(key);
          continue;
        }

        // Create new view
        const view = new ChunkLayerView(chunk, layerName, this.tileSize, this._boundGetTexture);
        this.chunkViews.set(key, view);
        this.layerContainers.get(layerName).addChild(view.container);
      }
    }

    // Destroy chunks that exited the viewport
    for (const chunkKey of exited) {
      const [cxStr, cyStr] = chunkKey.split(",");
      const cx = +cxStr;
      const cy = +cyStr;

      for (const layerName of this.layerNames) {
        const key = this._viewKey(cx, cy, layerName);
        const view = this.chunkViews.get(key);
        if (view) {
          view.destroy();
          this.chunkViews.delete(key);
        }
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
      const hasContent = layer && layer.some(v => v >= 0);

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

  getDebugInfo() {
    return {
      visibleChunkCount: this._lastVisible.size,
      visibleChunkKeys: [...this._lastVisible],
      enteredChunkCount: this._lastEntered.length,
      enteredChunkKeys: [...this._lastEntered],
      exitedChunkCount: this._lastExited.length,
      exitedChunkKeys: [...this._lastExited],
      mountedViewCount: this.chunkViews.size,
      emptyKeyCount: this._emptyKeys.size,
    };
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
