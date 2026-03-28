import "./EditorSubToolbar.css";

/**
 * A pure UI toolbar component that renders a horizontal strip of action buttons.
 * Knows nothing about editor state — receives a declarative `actions` array and renders it.
 */
export class EditorSubToolbar {
  /**
   * @param {HTMLElement} el - The container element to render into.
   */
  constructor(el) {
    this.el = el;
    this._actions = [];

    this._inner = document.createElement("div");
    this._inner.className = "subtoolbar-inner";
    this.el.appendChild(this._inner);
  }

  /**
   * Replaces the current action list and re-renders the toolbar.
   * @param {Array<{id?: string, label?: string, active?: boolean, disabled?: boolean, onClick?: Function, type?: string}>} actions
   */
  setActions(actions) {
    this._actions = actions;
    this._render();
  }

  /**
   * Renders buttons and separators from the current actions array.
   */
  _render() {
    this._inner.innerHTML = "";

    for (const action of this._actions) {
      if (action.type === "separator") {
        const sep = document.createElement("div");
        sep.className = "subtoolbar-separator";
        this._inner.appendChild(sep);
        continue;
      }

      const btn = document.createElement("button");
      btn.className = "subtoolbar-btn";
      btn.textContent = action.label ?? action.id ?? "";

      if (action.active) btn.classList.add("is-active");
      if (action.disabled) btn.disabled = true;

      if (action.onClick) {
        btn.addEventListener("click", action.onClick);
      }

      this._inner.appendChild(btn);
    }
  }

  /**
   * Clears the toolbar and removes rendered content.
   */
  destroy() {
    this._inner.innerHTML = "";
  }
}
