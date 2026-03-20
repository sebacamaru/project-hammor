export class DialogHost {
  constructor() {
    this._container = null;
    this._resolve = null;
    this._onKeyDown = null;
  }

  mount(container) {
    this._container = container;
  }

  unmount() {
    if (this._resolve) {
      this._close(false);
    }
    this._container = null;
  }

  confirm({ title, message, confirmLabel = "OK", cancelLabel = "Cancel", tone = "default" }) {
    // If already open, cancel the previous dialog
    if (this._resolve) {
      this._close(false);
    }

    return new Promise((resolve) => {
      this._resolve = resolve;

      const isDanger = tone === "danger";
      const confirmClass = `dialog-btn dialog-btn-confirm${isDanger ? " is-danger" : ""}`;

      this._container.innerHTML = `
        <div class="dialog-card">
          <div class="dialog-title">${this._esc(title)}</div>
          <div class="dialog-message">${this._esc(message)}</div>
          <div class="dialog-actions">
            <button class="dialog-btn dialog-btn-cancel" data-role="cancel">${this._esc(cancelLabel)}</button>
            <button class="${confirmClass}" data-role="confirm">${this._esc(confirmLabel)}</button>
          </div>
        </div>
      `;
      this._container.classList.add("is-open");

      // Card click stops propagation so backdrop click can cancel
      const card = this._container.querySelector(".dialog-card");
      card.addEventListener("pointerdown", (e) => e.stopPropagation());

      // Backdrop click → cancel
      this._container.addEventListener("pointerdown", this._onBackdropClick = () => {
        this._close(false);
      });

      // Button clicks
      this._container.querySelector('[data-role="cancel"]')
        .addEventListener("click", () => this._close(false));
      this._container.querySelector('[data-role="confirm"]')
        .addEventListener("click", () => this._close(true));

      // Keyboard (scoped to open state only)
      this._onKeyDown = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          this._close(false);
        } else if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          this._close(true);
        }
      };
      window.addEventListener("keydown", this._onKeyDown, true);

      // Focus: danger → cancel, otherwise → confirm
      const focusTarget = isDanger
        ? this._container.querySelector('[data-role="cancel"]')
        : this._container.querySelector('[data-role="confirm"]');
      focusTarget?.focus();
    });
  }

  _close(result) {
    const resolve = this._resolve;
    this._resolve = null;

    // Remove keyboard listener
    if (this._onKeyDown) {
      window.removeEventListener("keydown", this._onKeyDown, true);
      this._onKeyDown = null;
    }

    // Clean DOM
    if (this._container) {
      this._container.classList.remove("is-open");
      this._container.innerHTML = "";
    }

    if (resolve) resolve(result);
  }

  _esc(str) {
    const el = document.createElement("span");
    el.textContent = str;
    return el.innerHTML;
  }
}
