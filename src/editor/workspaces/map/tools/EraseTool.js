import { EraseTilesCommand } from "../history/commands/EraseTilesCommand.js";

export class EraseTool {
  constructor(state, getDocument, getHistory) {
    this.state = state;
    this.getDocument = getDocument;
    this.getHistory = getHistory;
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
    const doc = this.getDocument();
    const history = this.getHistory();

    if (!map || !doc || !history) return;
    if (ctx.tileX == null || ctx.tileY == null) return;

    const eraseKey = `${ctx.tileX},${ctx.tileY},${s.activeLayer}`;
    if (eraseKey === this.lastEraseKey) return;
    this.lastEraseKey = eraseKey;

    if (!this.isInsideMap(map, ctx.tileX, ctx.tileY)) return;

    const current = doc.getTile(s.activeLayer, ctx.tileX, ctx.tileY);
    if (current === -1) return;

    history.execute(new EraseTilesCommand(doc, s.activeLayer, [{
      x: ctx.tileX,
      y: ctx.tileY,
    }]));
  }

  isInsideMap(map, x, y) {
    return x >= 0 && y >= 0 && x < map.width && y < map.height;
  }
}
