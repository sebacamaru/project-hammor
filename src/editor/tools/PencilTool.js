import { PaintTilesCommand } from "../history/commands/PaintTilesCommand.js";

export class PencilTool {
  constructor(state, getDocument, getHistory) {
    this.state = state;
    this.getDocument = getDocument;
    this.getHistory = getHistory;
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
    const doc = this.getDocument();
    const history = this.getHistory();
    const brush = s.selectedBrush;

    if (!map || !doc || !history || !brush) return;
    if (ctx.tileX == null || ctx.tileY == null) return;

    const paintKey = `${ctx.tileX},${ctx.tileY},${s.activeLayer}`;
    if (paintKey === this.lastPaintKey) return;
    this.lastPaintKey = paintKey;

    const changes = [];

    for (let by = 0; by < brush.height; by++) {
      for (let bx = 0; bx < brush.width; bx++) {
        const index = by * brush.width + bx;
        const tileId = brush.tiles[index];

        if (tileId == null) continue;

        const x = ctx.tileX + bx;
        const y = ctx.tileY + by;

        if (!this.isInsideMap(map, x, y)) continue;

        const current = doc.getTile(s.activeLayer, x, y);
        if (current === tileId) continue;

        changes.push({ x, y, tileId });
      }
    }

    if (changes.length === 0) return;

    history.execute(new PaintTilesCommand(doc, s.activeLayer, changes));
  }

  isInsideMap(map, x, y) {
    return x >= 0 && y >= 0 && x < map.width && y < map.height;
  }
}
