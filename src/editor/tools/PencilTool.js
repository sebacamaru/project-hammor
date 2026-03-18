export class PencilTool {
  constructor(state) {
    this.state = state;
    this.isPainting = false;
    this.lastPaintKey = null;
  }

  pointerDown(ctx) {
    this.isPainting = true;
    this.paint(ctx);
  }

  pointerMove(ctx) {
    if (!this.isPainting) return;
    this.paint(ctx);
  }

  pointerUp() {
    this.isPainting = false;
    this.lastPaintKey = null;
  }

  paint(ctx) {
    const s = this.state.get();
    const map = s.map;
    const brush = s.selectedBrush;

    if (!map || !brush) return;
    if (ctx.tileX == null || ctx.tileY == null) return;

    const paintKey = `${ctx.tileX},${ctx.tileY},${s.activeLayer}`;
    if (paintKey === this.lastPaintKey) return;
    this.lastPaintKey = paintKey;

    for (let by = 0; by < brush.height; by++) {
      for (let bx = 0; bx < brush.width; bx++) {
        const index = by * brush.width + bx;
        const tileId = brush.tiles[index];

        if (tileId == null) continue;

        const x = ctx.tileX + bx;
        const y = ctx.tileY + by;

        if (!this.isInsideMap(map, x, y)) continue;

        const current = map.getTile(s.activeLayer, x, y);
        if (current === tileId) continue;

        map.setTile(s.activeLayer, x, y, tileId);

        const { cx, cy } = map.worldToChunk(x, y);
        s.dirtyChunks.add(`${cx},${cy}`);
      }
    }

    this.state.patch({ dirty: true });
  }

  isInsideMap(map, x, y) {
    return x >= 0 && y >= 0 && x < map.width && y < map.height;
  }
}
