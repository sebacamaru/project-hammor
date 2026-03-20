export class WorldEditorState {
  constructor() {
    this.selectedCell = null;   // { rx, ry } | null
    this.hoverCell = null;      // { rx, ry } | null
    this.selectedMapId = null;  // string | null
    this.activeTool = "place";
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.showGrid = true;
  }
}
