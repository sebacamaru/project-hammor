import "./EditorSubToolbar.css";
import { getIconStyle } from "./editorIcons.js";

/**
 * A pure UI toolbar component that renders a horizontal strip of action buttons
 * split into left, center, and right sections.
 *
 * The center section is always visually centered via CSS grid (1fr auto 1fr).
 * Knows nothing about editor state — receives a declarative actions object and renders it.
 */
export class EditorSubToolbar {
  /**
   * @param {HTMLElement} el - The container element to render into.
   */
  constructor(el) {
    this.el = el;
    this._sections = { left: [], center: [], right: [] };

    this._inner = document.createElement("div");
    this._inner.className = "subtoolbar-inner";

    this._leftEl   = this._createSection("left");
    this._centerEl = this._createSection("center");
    this._rightEl  = this._createSection("right");

    this._inner.appendChild(this._leftEl);
    this._inner.appendChild(this._centerEl);
    this._inner.appendChild(this._rightEl);

    this.el.appendChild(this._inner);
  }

  /**
   * Creates a named section div.
   * @param {"left"|"center"|"right"} name
   * @returns {HTMLElement}
   */
  _createSection(name) {
    const div = document.createElement("div");
    div.className = `subtoolbar-section subtoolbar-section--${name}`;
    return div;
  }

  /**
   * Replaces the current action list and re-renders the toolbar.
   *
   * Accepts either:
   *   - A sections object: `{ left?, center?, right? }` — each is an actions array
   *   - A flat array (backwards compat) — treated as the left section only
   *
   * @param {Array|{left?: Array, center?: Array, right?: Array}} actions
   */
  setActions(actions) {
    if (Array.isArray(actions)) {
      this._sections = { left: actions, center: [], right: [] };
    } else {
      this._sections = {
        left:   actions.left   ?? [],
        center: actions.center ?? [],
        right:  actions.right  ?? [],
      };
    }
    this._render();
  }

  /**
   * Renders all three sections from the current sections state.
   */
  _render() {
    this._leftEl.innerHTML   = "";
    this._centerEl.innerHTML = "";
    this._rightEl.innerHTML  = "";

    this._renderSection(this._sections.left,   this._leftEl);
    this._renderSection(this._sections.center, this._centerEl);
    this._renderSection(this._sections.right,  this._rightEl);
  }

  /**
   * Renders a list of actions into a container element.
   * - Separators render as thin vertical dividers.
   * - Buttons with a known icon render the sprite; label becomes tooltip.
   * - Buttons with an unknown or missing icon render as text.
   *
   * @param {Array<{id?: string, label?: string, icon?: string, active?: boolean, disabled?: boolean, onClick?: Function, type?: string}>} actions
   * @param {HTMLElement} container
   */
  _renderSection(actions, container) {
    for (const action of actions) {
      if (action.type === "separator") {
        const sep = document.createElement("div");
        sep.className = "subtoolbar-separator";
        container.appendChild(sep);
        continue;
      }

      const btn = document.createElement("button");
      btn.className = "subtoolbar-btn";

      if (action.active) btn.classList.add("is-active");
      if (action.disabled) btn.disabled = true;

      if (action.label) btn.title = action.label;

      if (action.icon) {
        const style = getIconStyle(action.icon);
        if (style) {
          const icon = document.createElement("span");
          icon.className = "editor-icon";
          Object.assign(icon.style, style);
          btn.appendChild(icon);

          if (action.label) {
            const text = document.createElement("span");
            text.className = "subtoolbar-label";
            text.textContent = action.label;
            btn.appendChild(text);
          }
        } else {
          btn.textContent = action.label ?? action.id ?? "";
        }
      } else {
        btn.textContent = action.label ?? action.id ?? "";
      }

      if (action.onClick) {
        btn.addEventListener("click", action.onClick);
      }

      container.appendChild(btn);
    }
  }

  /**
   * Clears all sections and removes rendered content.
   */
  destroy() {
    this._leftEl.innerHTML   = "";
    this._centerEl.innerHTML = "";
    this._rightEl.innerHTML  = "";
  }
}
