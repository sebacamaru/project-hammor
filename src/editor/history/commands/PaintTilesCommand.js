export class PaintTilesCommand {
  constructor(doc, layerId, changes) {
    this.doc = doc;
    this.layerId = layerId;
    this.forwardChanges = changes.map((change) => ({ ...change }));
    this.inverseChanges = [];
    this.hasExecuted = false;
  }

  do() {
    // no-op safety / redo determinista:
    // calculate inverse changes only once, then replay the captured forward changes.
    if (!this.hasExecuted) {
      const effectiveChanges = [];
      const inverseChanges = [];

      for (const change of this.forwardChanges) {
        const prevTileId = this.doc.getTile(this.layerId, change.x, change.y);
        if (prevTileId === change.tileId) continue;

        effectiveChanges.push(change);
        inverseChanges.push({
          x: change.x,
          y: change.y,
          tileId: prevTileId,
        });
      }

      if (effectiveChanges.length === 0) {
        return false;
      }

      this.forwardChanges = effectiveChanges;
      this.inverseChanges = inverseChanges;
      this.hasExecuted = true;
    }

    this.doc.withWriteLock(() => {
      this.doc.applyTileChanges(this.layerId, this.forwardChanges);
    });
    return true;
  }

  undo() {
    if (this.inverseChanges.length === 0) {
      return false;
    }

    this.doc.withWriteLock(() => {
      this.doc.applyTileChanges(this.layerId, this.inverseChanges);
    });
    return true;
  }
}
