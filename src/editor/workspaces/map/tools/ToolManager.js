/** Maps each tool ID to the set of editor modes where it is available. Declaration order = UI display order. */
export const TOOL_MODES = {
  pencil:     new Set(["terrain", "collisions"]),
  eraser:     new Set(["terrain", "collisions"]),
  eyedropper: new Set(["terrain"]),
};

/**
 * Returns the ordered list of tool IDs available in the given editor mode.
 * Order matches the declaration order of TOOL_MODES.
 * @param {string} mode
 * @returns {string[]}
 */
export function getToolsForMode(mode) {
  return Object.keys(TOOL_MODES).filter(id => TOOL_MODES[id].has(mode));
}

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
    const allowed = TOOL_MODES[id];
    if (allowed && !allowed.has(this.state.get().mode)) {
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
