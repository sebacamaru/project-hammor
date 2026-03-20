import { PaintTilesCommand } from "./PaintTilesCommand.js";

export class EraseTilesCommand extends PaintTilesCommand {
  constructor(doc, layerId, changes) {
    super(
      doc,
      layerId,
      changes.map((change) => ({
        ...change,
        tileId: -1,
      })),
    );
  }
}
