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
      if (!btn) return;

      this.state.update((s) => {
        s.activeTool = btn.dataset.tool;
      });
    });
  }

  sync() {
    const { activeTool } = this.state.get();

    for (const btn of this.el.querySelectorAll("[data-tool]")) {
      btn.classList.toggle("is-active", btn.dataset.tool === activeTool);
    }
  }

  destroy() {
    this.unsubscribe?.();
  }
}
