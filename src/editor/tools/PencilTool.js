export class PencilTool {
  constructor(state) {
    this.state = state;
    this.isPainting = false;
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
  }

  paint(ctx) {
    if (ctx.tileX == null || ctx.tileY == null) return;
    if (this.lastX === ctx.tileX && this.lastY === ctx.tileY) return;

    this.lastX = ctx.tileX;
    this.lastY = ctx.tileY;

    const s = this.state.get();
    const map = s.map;
    if (!map) return;

    const tileId = s.selectedBrush.tiles[0];
    map.setTile(s.activeLayer, ctx.tileX, ctx.tileY, tileId);

    this.state.patch({ dirty: true });
  }
}
