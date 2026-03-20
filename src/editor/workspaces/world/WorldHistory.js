export class WorldHistory {
  constructor() {
    this._undoStack = [];
    this._redoStack = [];
  }

  canUndo() { return this._undoStack.length > 0; }
  canRedo() { return this._redoStack.length > 0; }

  push(entry) {
    this._undoStack.push(entry);
    this._redoStack.length = 0;
  }

  undo() {
    const entry = this._undoStack.pop();
    if (!entry) return null;
    this._redoStack.push(entry);
    return entry;
  }

  redo() {
    const entry = this._redoStack.pop();
    if (!entry) return null;
    this._undoStack.push(entry);
    return entry;
  }

  clear() {
    this._undoStack.length = 0;
    this._redoStack.length = 0;
  }
}
