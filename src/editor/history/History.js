export class History {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
  }

  execute(command) {
    if (!command) return false;

    const didApply = command.do();
    if (didApply === false) return false;

    this.undoStack.push(command);
    this.redoStack.length = 0;
    return true;
  }

  undo() {
    const command = this.undoStack.pop();
    if (!command) return false;

    const didUndo = command.undo();
    if (didUndo === false) return false;

    this.redoStack.push(command);
    return true;
  }

  redo() {
    const command = this.redoStack.pop();
    if (!command) return false;

    const didRedo = command.do();
    if (didRedo === false) return false;

    this.undoStack.push(command);
    return true;
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
