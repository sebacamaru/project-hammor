import { MapChunkRenderer } from "../../shared/render/MapChunkRenderer.js";

const RENDER_LAYERS = ["ground", "ground_detail", "fringe"];

export class LoadedRegion {
  /**
   * @param {number} rx - region grid X
   * @param {number} ry - region grid Y
   * @param {string} mapId
   * @param {import('../../shared/data/models/MapData.js').MapData} map
   * @param {number} offsetX - world pixel offset (rx * regionPixelWidth)
   * @param {number} offsetY - world pixel offset (ry * regionPixelHeight)
   * @param {import('../../shared/render/ViewportState.js').ViewportState} viewport
   */
  constructor(rx, ry, mapId, map, offsetX, offsetY, viewport) {
    this.rx = rx;
    this.ry = ry;
    this.mapId = mapId;
    this.map = map;
    this.offsetX = offsetX;
    this.offsetY = offsetY;

    this.chunkRenderer = new MapChunkRenderer(map, viewport, RENDER_LAYERS);

    // Position layer containers at world offset so map-local
    // chunk sprites render at correct world positions
    for (const name of RENDER_LAYERS) {
      const container = this.chunkRenderer.getLayerContainer(name);
      container.x = offsetX;
      container.y = offsetY;
    }
  }

  getLayerContainer(name) {
    return this.chunkRenderer.getLayerContainer(name);
  }

  worldToLocal(worldX, worldY) {
    return { x: worldX - this.offsetX, y: worldY - this.offsetY };
  }

  /** Update chunk visibility using world-space camera, converted to map-local */
  updateVisibility(camera) {
    this.chunkRenderer.update({
      x: camera.x - this.offsetX,
      y: camera.y - this.offsetY,
    });
  }

  destroy() {
    this.chunkRenderer.destroy();
  }
}
