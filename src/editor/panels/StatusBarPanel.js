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
      </div>
    `;
  }

  sync() {
    const s = this.state.get();

    const modeEl = this.el.querySelector('[data-role="mode"]');
    const layerEl = this.el.querySelector('[data-role="layer"]');
    const toolEl = this.el.querySelector('[data-role="tool"]');
    const tileEl = this.el.querySelector('[data-role="tile"]');
    const zoomEl = this.el.querySelector('[data-role="zoom"]');
    const dirtyEl = this.el.querySelector('[data-role="dirty"]');

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
      const zoom = s.camera?.zoom || 1;
      zoomEl.textContent = `Zoom: ${zoom}x`;
    }

    if (dirtyEl) {
      dirtyEl.textContent = s.dirty ? "Unsaved changes" : "Saved";
    }
  }

  destroy() {
    this.unsubscribe?.();
  }
}
