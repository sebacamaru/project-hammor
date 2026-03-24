import { TOOL_MODES } from "../workspaces/map/tools/ToolManager.js";

/**
 * Reusable mode-tab component that renders into the shell topbar's `.shell-modes` slot.
 * Any workspace can instantiate this with its own mode list.
 */
export class WorkspaceModesPanel {
  /**
   * @param {HTMLElement} el - The .shell-modes container provided via editorApi.
   * @param {object} state - Pub-sub state object with a `mode` field and subscribe/update methods.
   * @param {Array<{ id: string, label: string }>} modes - Ordered list of modes to display.
   */
  constructor(el, state, modes) {
    this.el = el;
    this.state = state;
    this.modes = modes;

    this._render();
    this._unsubscribe = this.state.subscribe(() => this._sync());
    this._sync();
  }

  /** Builds the tab buttons once. */
  _render() {
    this.el.innerHTML = "";
    for (const { id, label } of this.modes) {
      const btn = document.createElement("button");
      btn.className = "shell-mode-tab";
      btn.textContent = label;
      btn.dataset.modeId = id;
      btn.addEventListener("click", () => {
        this.state.update((s) => {
          if (s.mode === id) return;
          if (s.mode === "terrain") s.lastTerrainTool = s.activeTool;
          s.mode = id;
          if (id === "terrain") {
            s.activeTool = s.lastTerrainTool || "pencil";
          } else {
            // Normalize: if current tool is invalid for the new mode, fall back to pencil
            const allowed = TOOL_MODES[s.activeTool];
            if (allowed && !allowed.has(id)) {
              s.activeTool = "pencil";
            }
          }
        });
      });
      this.el.appendChild(btn);
    }
  }

  /** Syncs the active tab indicator with current state. */
  _sync() {
    const { mode } = this.state.get();
    for (const btn of this.el.querySelectorAll(".shell-mode-tab")) {
      btn.classList.toggle("is-active", btn.dataset.modeId === mode);
    }
  }

  /**
   * Removes tabs from the slot and unsubscribes from state.
   * Must be called when the workspace unmounts.
   */
  destroy() {
    this._unsubscribe?.();
    this.el.innerHTML = "";
  }
}
