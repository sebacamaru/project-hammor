/**
 * Root DOM container for all in-game UI overlays.
 * Mounted as a sibling of the canvas inside #game (which must have position: relative).
 * Uses pointer-events: none so the canvas receives mouse input by default;
 * individual child components opt-in to pointer-events as needed.
 */
export class GameUIRoot {
  /**
   * @param {HTMLElement} parentElement - The #game container element.
   */
  constructor(parentElement) {
    this._el = document.createElement("div");
    this._el.className = "game-ui-root";
    parentElement.appendChild(this._el);
  }

  /**
   * Returns the root DOM element for child UI components to mount into.
   * @returns {HTMLElement}
   */
  getRoot() {
    return this._el;
  }

  /**
   * Removes the root element from the DOM.
   */
  destroy() {
    this._el.remove();
    this._el = null;
  }
}
