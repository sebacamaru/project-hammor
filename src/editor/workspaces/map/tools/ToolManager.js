/** Tool IDs that only operate in terrain mode. */
const TERRAIN_TOOLS = new Set(["pencil", "eraser", "eyedropper"]);

export class ToolManager {
  constructor(state) {
    this.state = state;
    this.tools = new Map();
    this.temporaryToolId = null;
  }

  register(id, tool) {
    this.tools.set(id, tool);
  }

  getTool(id) {
    return this.tools.get(id) ?? null;
  }

  getActiveToolId() {
    return this.temporaryToolId ?? this.state.get().activeTool;
  }

  /**
   * Returns the active tool instance, or null if the current tool is gated
   * by mode (e.g. terrain tools are unavailable outside terrain mode).
   */
  getActiveTool() {
    const id = this.getActiveToolId();
    if (TERRAIN_TOOLS.has(id) && this.state.get().mode !== "terrain") {
      return null;
    }
    return this.getTool(id);
  }

  setTemporaryTool(id) {
    this.temporaryToolId = id;
  }

  clearTemporaryTool() {
    this.temporaryToolId = null;
  }

  pointerDown(ctx) {
    this.getActiveTool()?.pointerDown?.(ctx);
  }

  pointerMove(ctx) {
    this.getActiveTool()?.pointerMove?.(ctx);
  }

  pointerUp(ctx) {
    this.getActiveTool()?.pointerUp?.(ctx);
  }
}
