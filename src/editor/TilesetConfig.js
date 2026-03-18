/**
 * Configuración del tileset para el editor.
 * Define grupos de tiles para el TilesPanel.
 *
 * Cada tile ID mapea a una posición en el atlas:
 *   atlasX = id % columns
 *   atlasY = Math.floor(id / columns)
 *   pixelX = atlasX * tileSize
 *   pixelY = atlasY * tileSize
 */
export const TILESET_CONFIG = {
  image: "/content/atlas/atlas_world.webp",
  tileSize: 16,
  columns: 128,

  groups: [
    { id: "ground_basic", name: "Ground Basic", startId: 0, count: 16 },
    { id: "ground_row2", name: "Ground Row 2", startId: 128, count: 16 },
    { id: "ground_row3", name: "Ground Row 3", startId: 256, count: 16 },
  ],
};
