const LAYERS = ["ground", "ground_detail", "fringe"];

export class LayersPanel {
  constructor(el, state) {
    this.el = el;
    this.state = state;

    this.render();
    this.unsubscribe = this.state.subscribe(() => this.sync());
    this.sync();
  }

  render() {
    this.el.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">Layers</div>
        <div class="layers-list">
          ${LAYERS.map(
            (layer) => `
            <div class="layer-row" data-layer-row="${layer}">
              <label class="layer-active">
                <input type="radio" name="active-layer" value="${layer}">
                <span>${layer}</span>
              </label>

              <button
                type="button"
                class="layer-visibility"
                data-toggle-layer="${layer}"
                title="Toggle visibility"
              >
                👁
              </button>
            </div>
          `,
          ).join("")}
        </div>
      </div>
    `;

    this.el.addEventListener("change", (e) => {
      const input = e.target.closest('input[name="active-layer"]');
      if (!input) return;

      this.state.update((s) => {
        s.activeLayer = input.value;
      });
    });

    this.el.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-toggle-layer]");
      if (!btn) return;

      const layer = btn.dataset.toggleLayer;

      this.state.update((s) => {
        s.visibleLayers[layer] = !s.visibleLayers[layer];
      });
    });
  }

  sync() {
    const s = this.state.get();

    for (const layer of LAYERS) {
      const radio = this.el.querySelector(
        `input[name="active-layer"][value="${layer}"]`,
      );
      if (radio) {
        radio.checked = s.activeLayer === layer;
      }

      const row = this.el.querySelector(`[data-layer-row="${layer}"]`);
      row?.classList.toggle("is-hidden", !s.visibleLayers[layer]);

      const btn = this.el.querySelector(`[data-toggle-layer="${layer}"]`);
      if (btn) {
        btn.classList.toggle("is-off", !s.visibleLayers[layer]);
        btn.textContent = s.visibleLayers[layer] ? "👁" : "🚫";
      }
    }
  }

  destroy() {
    this.unsubscribe?.();
  }
}
