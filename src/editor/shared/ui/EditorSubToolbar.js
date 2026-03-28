import "./EditorSubToolbar.css";

/**
 * Icon name → column index in editor_icons.webp (16px per slot, single row).
 * Adjust indices to match the actual sprite sheet layout.
 */
const ICON_MAP = {
  save:        0,
  undo:        1,
  redo:        2,
  pencil:      3,
  eraser:      4,
  eyedropper:  5,
  // slots 6–19 reserved
};

/**
 * Returns the CSS background-position style for the named icon,
 * or null if the name is not in ICON_MAP (avoids silently showing wrong icon).
 * @param {string} name
 * @returns {{ backgroundPosition: string } | null}
 */
function getIconStyle(name) {
  if (!(name in ICON_MAP)) return null;
  const col = ICON_MAP[name];
  return { backgroundPosition: `${-(col * 16)}px 0px` };
}

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
   * @param {Array<{id?: string, label?: string, icon?: string, active?: boolean, disabled?: boolean, onClick?: Function, type?: string}>} actions
   */
  setActions(actions) {
    this._actions = actions;
    this._render();
  }

  /**
   * Renders buttons and separators from the current actions array.
   * - If action.icon is set and known: renders a sprite icon; label becomes tooltip only.
   * - If action.icon is set but unknown: falls back to text.
   * - If no action.icon: renders text button.
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

      if (action.active) btn.classList.add("is-active");
      if (action.disabled) btn.disabled = true;

      if (action.label) btn.title = action.label;

      if (action.icon) {
        const style = getIconStyle(action.icon);
        if (style) {
          const icon = document.createElement("span");
          icon.className = "subtoolbar-icon";
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
