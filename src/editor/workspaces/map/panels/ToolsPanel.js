import { getToolsForMode } from "../tools/ToolManager.js";

/** Tool ID → button label. */
const TOOL_LABELS = {
  pencil: "Pencil",
  eraser: "Erase",
  eyedropper: "Eyedropper",
};

export class ToolsPanel {
  constructor(el, state) {
    this.el = el;
    this.state = state;
    this._lastMode = null;

    this._renderShell();
    this.unsubscribe = this.state.subscribe(() => this.sync());
    this.sync();
  }

  /** Builds the outer wrapper once and attaches the click delegate. */
  _renderShell() {
    this.el.innerHTML = `<div class="tools-buttons"></div>`;
    this._buttonsEl = this.el.querySelector(".tools-buttons");

    this.el.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tool]");
      if (!btn || btn.disabled) return;

      this.state.update((s) => {
        s.activeTool = btn.dataset.tool;
      });
    });
  }

  /** Rebuilds the button set for the given tool IDs. */
  _renderButtons(toolIds) {
    this._buttonsEl.innerHTML = "";
    for (const id of toolIds) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.tool = id;
      btn.textContent = TOOL_LABELS[id] ?? id;
      this._buttonsEl.appendChild(btn);
    }
  }

  sync() {
    const { activeTool, mode } = this.state.get();

    // Rebuild buttons only when mode actually changes
    if (mode !== this._lastMode) {
      this._lastMode = mode;
      this._renderButtons(getToolsForMode(mode));
    }

    for (const btn of this._buttonsEl.querySelectorAll("[data-tool]")) {
      btn.classList.toggle("is-active", btn.dataset.tool === activeTool);
    }
  }

  destroy() {
    this.unsubscribe?.();
  }
}
