/**
 * Holds the current editor state: selected tool, tile, layer, etc.
 */
export class EditorState {
  constructor() {
    this.currentTool = "brush";
    this.selectedTileId = 1;
    this.brushSize = 1;
    this.activeLayer = "ground";
  }
}
