import { MapData } from "./MapData.js";

/**
 * GameMap extends MapData with convenience methods for development/testing.
 * In production, maps will be loaded via MapLoader into MapData directly.
 */
export class GameMap extends MapData {
  constructor(width, height) {
    super(width, height);
    this.addLayer("ground");
    this.generateTest();
  }

  generateTest() {
    const ground = this.getLayer("ground");
    for (let i = 0; i < ground.data.length; i++) {
      ground.data[i] = Math.random() > 0.8 ? 1 : 0;
    }
  }

  // Backward-compatible: TilemapRenderer calls map.getTile("ground", x, y)
  // This is inherited from MapData now.
}
