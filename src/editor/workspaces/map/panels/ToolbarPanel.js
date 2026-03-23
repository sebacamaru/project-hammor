export class ToolbarPanel {
  constructor(el, state) {
    this.el = el;
    this.state = state;

    this.render();
    this.unsubscribe = this.state.subscribe(() => this.sync());
    this.sync();
  }

  render() {
    this.el.innerHTML = `
      <div class="toolbar-buttons">
        <button type="button" data-mode="terrain">Terrain</button>
        <button type="button" data-mode="collisions">Collisions</button>
        <button type="button" data-mode="events">Events</button>
        <button type="button" data-mode="lights">Lights</button>
        <button type="button" data-mode="database">Database</button>
      </div>
    `;

    this.el.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-mode]");
      if (!btn) return;

      const nextMode = btn.dataset.mode;
      this.state.update((s) => {
        const prevMode = s.mode;
        if (prevMode === nextMode) return;

        // Save current terrain tool when leaving terrain mode
        if (prevMode === "terrain") {
          s.lastTerrainTool = s.activeTool;
        }

        s.mode = nextMode;

        // Restore terrain tool when entering terrain mode
        if (nextMode === "terrain") {
          s.activeTool = s.lastTerrainTool || "pencil";
        }
      });
    });
  }

  sync() {
    const { mode } = this.state.get();

    for (const btn of this.el.querySelectorAll("[data-mode]")) {
      btn.classList.toggle("is-active", btn.dataset.mode === mode);
    }
  }

  destroy() {
    this.unsubscribe?.();
  }
}
