export class ToolsPanel {
  constructor(el, state) {
    this.el = el;
    this.state = state;

    this.render();
    this.unsubscribe = this.state.subscribe(() => this.sync());
    this.sync();
  }

  render() {
    this.el.innerHTML = `
      <div class="tools-buttons">
        <button type="button" data-tool="pencil">Pencil</button>
        <button type="button" data-tool="eraser">Erase</button>
        <button type="button" data-tool="eyedropper">Eyedropper</button>
      </div>
    `;

    this.el.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tool]");
      if (!btn || btn.disabled) return;

      this.state.update((s) => {
        s.activeTool = btn.dataset.tool;
      });
    });
  }

  sync() {
    const { activeTool, mode } = this.state.get();
    const terrainMode = mode === "terrain";

    for (const btn of this.el.querySelectorAll("[data-tool]")) {
      btn.disabled = !terrainMode;
      btn.classList.toggle("is-disabled", !terrainMode);
      btn.classList.toggle("is-active", terrainMode && btn.dataset.tool === activeTool);
    }
  }

  destroy() {
    this.unsubscribe?.();
  }
}
