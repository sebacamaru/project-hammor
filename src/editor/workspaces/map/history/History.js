export class History {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    /** @type {Function|null} Optional callback invoked after any stack mutation. */
    this.onChange = null;
  }

  /**
   * Executes a command, pushes it onto the undo stack, and clears the redo stack.
   * @param {object} command
   * @returns {boolean} Whether the command was applied.
   */
  execute(command) {
    if (!command) return false;

    const didApply = command.do();
    if (didApply === false) return false;

    this.undoStack.push(command);
    this.redoStack.length = 0;
    this.onChange?.();
    return true;
  }

  /**
   * Undoes the last command.
   * @returns {boolean} Whether an undo was performed.
   */
  undo() {
    const command = this.undoStack.pop();
    if (!command) return false;

    const didUndo = command.undo();
    if (didUndo === false) return false;

    this.redoStack.push(command);
    this.onChange?.();
    return true;
  }

  /**
   * Redoes the last undone command.
   * @returns {boolean} Whether a redo was performed.
   */
  redo() {
    const command = this.redoStack.pop();
    if (!command) return false;

    const didRedo = command.do();
    if (didRedo === false) return false;

    this.undoStack.push(command);
    this.onChange?.();
    return true;
  }

  /**
   * Clears both stacks.
   */
  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.onChange?.();
  }
}
