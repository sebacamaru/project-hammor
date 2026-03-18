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

      this.state.update((s) => {
        s.mode = btn.dataset.mode;
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
