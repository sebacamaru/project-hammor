export class StatusBarPanel {
  constructor(el, state) {
    this.el = el;
    this.state = state;

    this.render();
    this.unsubscribe = this.state.subscribe(() => this.sync());
    this.sync();
  }

  render() {
    this.el.innerHTML = `
      <div class="statusbar-content">
        <span class="status-item" data-role="mode"></span>
        <span class="status-item" data-role="layer"></span>
        <span class="status-item" data-role="tool"></span>
        <span class="status-item" data-role="tile"></span>
        <span class="status-item" data-role="zoom"></span>
        <span class="status-item" data-role="dirty"></span>
        <span class="status-item status-item-status" data-role="status"></span>
        <label class="status-item status-item-focus" title="Toggle browser fullscreen">
          <input type="checkbox" data-role="focus-mode">
          <span>Focus Mode</span>
        </label>
      </div>
    `;

    this._focusCheckbox = this.el.querySelector('[data-role="focus-mode"]');
    this._focusCheckbox.checked = document.fullscreenElement != null;

    this._onFocusToggle = async () => {
      try {
        if (this._focusCheckbox.checked) {
          await document.documentElement.requestFullscreen?.();
        } else {
          await document.exitFullscreen?.();
        }
      } catch {
        // Browser blocked the request (e.g. user denied, permissions policy).
        // Reflect the real state back so the checkbox doesn't lie.
        this._focusCheckbox.checked = document.fullscreenElement != null;
      }
    };
    this._focusCheckbox.addEventListener("change", this._onFocusToggle);

    // Keep the checkbox in sync when fullscreen is toggled outside this UI —
    // F11, Esc, browser menu, etc.
    this._onFullscreenChange = () => {
      this._focusCheckbox.checked = document.fullscreenElement != null;
    };
    document.addEventListener("fullscreenchange", this._onFullscreenChange);
  }

  sync() {
    const s = this.state.get();

    const modeEl = this.el.querySelector('[data-role="mode"]');
    const layerEl = this.el.querySelector('[data-role="layer"]');
    const toolEl = this.el.querySelector('[data-role="tool"]');
    const tileEl = this.el.querySelector('[data-role="tile"]');
    const zoomEl = this.el.querySelector('[data-role="zoom"]');
    const dirtyEl = this.el.querySelector('[data-role="dirty"]');
    const statusEl = this.el.querySelector('[data-role="status"]');

    if (modeEl) modeEl.textContent = `Mode: ${s.mode}`;
    if (layerEl) layerEl.textContent = `Layer: ${s.activeLayer}`;
    if (toolEl) toolEl.textContent = `Tool: ${s.activeTool}`;

    if (tileEl) {
      if (s.hoverTile) {
        tileEl.textContent = `Tile: ${s.hoverTile.x}, ${s.hoverTile.y}`;
      } else {
        tileEl.textContent = "Tile: -";
      }
    }

    if (zoomEl) {
      zoomEl.textContent = `Zoom: ${s.editorScale}x`;
    }

    if (dirtyEl) {
      dirtyEl.textContent = s.dirty ? "Unsaved changes" : "Saved";
    }

    if (statusEl) {
      statusEl.textContent = s.statusMessage ? `Status: ${s.statusMessage}` : "";
    }
  }

  destroy() {
    this.unsubscribe?.();
    if (this._onFullscreenChange) {
      document.removeEventListener("fullscreenchange", this._onFullscreenChange);
      this._onFullscreenChange = null;
    }
    if (this._focusCheckbox && this._onFocusToggle) {
      this._focusCheckbox.removeEventListener("change", this._onFocusToggle);
    }
    this._focusCheckbox = null;
    this._onFocusToggle = null;
  }
}
