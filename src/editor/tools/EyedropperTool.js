export class EyedropperTool {
  constructor(state) {
    this.state = state;
  }

  pointerDown(ctx) {
    this.pick(ctx);
  }

  pointerMove() {}
  pointerUp() {}

  pick(ctx) {
    const s = this.state.get();
    const map = s.map;
    if (!map) return;
    if (ctx.tileX == null || ctx.tileY == null) return;
    if (ctx.tileX < 0 || ctx.tileY < 0 || ctx.tileX >= map.width || ctx.tileY >= map.height) return;

    const tileId = map.getTile(s.activeLayer, ctx.tileX, ctx.tileY);
    if (tileId < 0) return;

    const changed = tileId !== s.selectedTileId;

    this.state.update((st) => {
      st.selectedTileId = tileId;
      st.selectedBrush = { width: 1, height: 1, tiles: [tileId] };
      if (changed) st.activeTool = "pencil";
    });
  }
}
