import "./ModalDialog.css";

let _modalIdCounter = 0;

/**
 * Reusable centered modal dialog with dark backdrop overlay.
 *
 * Supports title, body content slot, optional footer slot,
 * Escape / backdrop-click / close-button dismissal, and clean lifecycle.
 */
export class ModalDialog {
  /**
   * @param {object} opts
   * @param {string} opts.title — Dialog title text
   * @param {HTMLElement} [opts.content] — Element to mount inside the body slot
   * @param {HTMLElement} [opts.footer] — Element to mount inside the footer slot (omitted if null)
   * @param {() => void} [opts.onClose] — Called exactly once per open/close cycle
   * @param {string} [opts.className] — Extra class added to the dialog panel
   * @param {HTMLElement} [opts.mountParent] — Where to append the overlay (defaults to document.body)
   */
  /**
   * @param {object} opts
   * @param {string} opts.title — Dialog title text
   * @param {HTMLElement} [opts.content] — Element to mount inside the body slot
   * @param {HTMLElement} [opts.footer] — Element to mount inside the footer slot (omitted if null)
   * @param {() => void} [opts.onClose] — Called exactly once per open/close cycle
   * @param {() => Promise<boolean>} [opts.onBeforeClose] — Async guard for user-initiated close. Return false to cancel.
   * @param {string} [opts.className] — Extra class added to the dialog panel
   * @param {HTMLElement} [opts.mountParent] — Where to append the overlay (defaults to document.body)
   */
  constructor({ title, content, footer, onClose, onBeforeClose, className, mountParent } = {}) {
    this._title = title;
    this._content = content || null;
    this._footer = footer || null;
    this._onClose = onClose || null;
    this._onBeforeClose = onBeforeClose || null;
    this._className = className || null;
    this._mountParent = mountParent || document.body;

    this._open = false;
    this._overlayEl = null;
    this._onKeyDown = null;
    this._titleId = `modal-title-${++_modalIdCounter}`;
    this._isClosingRequested = false;
  }

  /** @returns {boolean} Whether the modal is currently open */
  isOpen() {
    return this._open;
  }

  /** Open the modal — builds DOM, appends to mount parent, focuses close button. */
  open() {
    if (this._open) return;
    this._open = true;

    // ── Build DOM ──
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const dialog = document.createElement("div");
    dialog.className = "modal-dialog" + (this._className ? ` ${this._className}` : "");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", this._titleId);

    // Header
    const header = document.createElement("div");
    header.className = "modal-header";

    const titleEl = document.createElement("span");
    titleEl.className = "modal-title";
    titleEl.id = this._titleId;
    titleEl.textContent = this._title;

    const closeBtn = document.createElement("button");
    closeBtn.className = "modal-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", () => this.requestClose());

    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    dialog.appendChild(header);

    // Body
    const body = document.createElement("div");
    body.className = "modal-body";
    if (this._content) {
      body.appendChild(this._content);
    }
    dialog.appendChild(body);

    // Footer (optional)
    if (this._footer) {
      const footer = document.createElement("div");
      footer.className = "modal-footer";
      footer.appendChild(this._footer);
      dialog.appendChild(footer);
    }

    overlay.appendChild(dialog);
    this._overlayEl = overlay;

    // ── Backdrop click: close only when clicking the overlay itself ──
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        this.requestClose();
      }
    });

    // ── Escape key (capture phase, same pattern as DialogHost) ──
    this._onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.requestClose();
      }
    };
    window.addEventListener("keydown", this._onKeyDown, true);

    // ── Mount ──
    this._mountParent.appendChild(overlay);

    // ── Focus close button ──
    closeBtn.focus();
  }

  /**
   * User-initiated close — runs the onBeforeClose guard (if any) and only closes
   * if the guard returns true. Reentrant calls while the guard is pending are ignored.
   * @returns {Promise<void>}
   */
  async requestClose() {
    if (this._isClosingRequested) return;
    this._isClosingRequested = true;
    try {
      if (this._onBeforeClose) {
        const allowed = await this._onBeforeClose();
        if (!allowed) {
          this._isClosingRequested = false;
          return;
        }
      }
      this.close();
    } finally {
      this._isClosingRequested = false;
    }
  }

  /**
   * Close the modal — removes DOM, cleans listeners, fires onClose once.
   * Safe to call multiple times; onClose only fires on the first call after open().
   * Bypasses onBeforeClose — use requestClose() for user-initiated closes.
   */
  close() {
    this._isClosingRequested = false;
    if (!this._open) return;
    this._open = false;

    // Remove keyboard listener
    if (this._onKeyDown) {
      window.removeEventListener("keydown", this._onKeyDown, true);
      this._onKeyDown = null;
    }

    // Remove DOM
    if (this._overlayEl && this._overlayEl.parentNode) {
      this._overlayEl.parentNode.removeChild(this._overlayEl);
    }
    this._overlayEl = null;

    // Callback (exactly once per cycle)
    if (this._onClose) {
      this._onClose();
    }
  }

  /**
   * Destroy the modal. Calls close() if open; no-op if already closed.
   * onClose never fires twice for a single open/close cycle.
   */
  destroy() {
    this.close();
  }
}
