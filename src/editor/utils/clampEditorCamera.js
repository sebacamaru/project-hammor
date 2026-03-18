/**
 * Clamps editor camera so that any corner of the map can be centered on screen.
 * Allows half-viewport margin around the map in every direction.
 *
 * @param {{ x: number, y: number, zoom?: number }} camera  State camera object (mutated in place)
 * @param {number} mapWidthPx   Map width in world pixels
 * @param {number} mapHeightPx  Map height in world pixels
 * @param {import('../../shared/render/ViewportState.js').ViewportState} viewport
 */
export function clampEditorCamera(camera, mapWidthPx, mapHeightPx, viewport) {
  const zoom = camera.zoom || 1;
  const viewW = viewport.widthPx / zoom;
  const viewH = viewport.heightPx / zoom;

  camera.x = Math.max(-viewW / 2, Math.min(mapWidthPx - viewW / 2, camera.x));
  camera.y = Math.max(-viewH / 2, Math.min(mapHeightPx - viewH / 2, camera.y));
}
