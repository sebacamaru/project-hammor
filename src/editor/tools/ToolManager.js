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

  getActiveTool() {
    return this.getTool(this.getActiveToolId());
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
