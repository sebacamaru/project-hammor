import { bucketFill } from "../utils/bucketFill.js";
import { PaintTilesCommand } from "../history/commands/PaintTilesCommand.js";

export class BucketTool {
  /**
   * @param {import("../MapEditorState.js").MapEditorState} state
   * @param {() => import("../document/MapDocument.js").MapDocument|null} getDocument
   * @param {() => import("../history/History.js").History} getHistory
   */
  constructor(state, getDocument, getHistory) {
    this.state = state;
    this.getDocument = getDocument;
    this.getHistory = getHistory;
  }

  /**
   * Performs a flood fill starting at the clicked tile position.
   * @param {object} ctx - Pointer context from MapEditorViewport.
   */
  pointerDown(ctx) {
    if (ctx.tileX == null || ctx.tileY == null) return;

    const doc = this.getDocument();
    const history = this.getHistory();
    if (!doc || !history) return;

    const { selectedTileId, activeLayer } = this.state.get();
    if (!Number.isInteger(selectedTileId)) return;

    const layerId = activeLayer;
    if (!doc.getLayer(layerId)) return;

    const { changes } = bucketFill({
      doc,
      layerId,
      startX: ctx.tileX,
      startY: ctx.tileY,
      replacementTileId: selectedTileId,
    });

    if (changes.length === 0) return;

    history.execute(new PaintTilesCommand(doc, layerId, changes));
  }

  pointerMove() {}
  pointerUp() {}
}
