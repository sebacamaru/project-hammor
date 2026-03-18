export class EraseTool {
  constructor(state) {
    this.state = state;
    this.isErasing = false;
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
  }

  erase(ctx) {
    const s = this.state.get();
    const map = s.map;
    if (!map) return;
    if (ctx.tileX == null || ctx.tileY == null) return;

    map.setTile(s.activeLayer, ctx.tileX, ctx.tileY, -1);

    this.state.patch({ dirty: true });
  }
}
