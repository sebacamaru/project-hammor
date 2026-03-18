export class EraseTool {
  constructor(state) {
    this.state = state;
    this.isErasing = false;
    this.lastEraseKey = null;
  }

  pointerDown(ctx) {
    this.isErasing = true;
    this.erase(ctx);
  }

  pointerMove(ctx) {
    if (!this.isErasing) return;
    this.erase(ctx);
  }

  pointerUp() {
    this.isErasing = false;
    this.lastEraseKey = null;
  }

  erase(ctx) {
    const s = this.state.get();
    const map = s.map;

    if (!map) return;
    if (ctx.tileX == null || ctx.tileY == null) return;

    const eraseKey = `${ctx.tileX},${ctx.tileY},${s.activeLayer}`;
    if (eraseKey === this.lastEraseKey) return;
    this.lastEraseKey = eraseKey;

    if (!this.isInsideMap(map, ctx.tileX, ctx.tileY)) return;

    const current = map.getTile(s.activeLayer, ctx.tileX, ctx.tileY);
    if (current === -1) return;

    map.setTile(s.activeLayer, ctx.tileX, ctx.tileY, -1);

    const { cx, cy } = map.worldToChunk(ctx.tileX, ctx.tileY);
    s.dirtyChunks.add(`${cx},${cy}`);

    this.state.patch({ dirty: true });
  }

  isInsideMap(map, x, y) {
    return x >= 0 && y >= 0 && x < map.width && y < map.height;
  }
}
