import "./LayerVisibilityPanel.css";

const LAYERS = [
  { id: "ground", label: "Ground" },
  { id: "ground_detail", label: "Detail" },
  { id: "fringe", label: "Fringe" },
];

export class LayerVisibilityPanel {
  /**
   * @param {object} opts
   * @param {() => { mode: string, activeLayer: string, visibleLayers: Record<string, boolean>, showGrid: boolean }} opts.getState
   * @param {(layerId: string, visible: boolean) => void} opts.onToggleLayer
   * @param {(layerId: string) => void} opts.onSelectLayer
   * @param {(visible: boolean) => void} opts.onToggleGrid
   * @param {(listener: Function) => Function} opts.subscribe
   */
  constructor({
    getState,
    onToggleLayer,
    onSelectLayer,
    onToggleGrid,
    subscribe,
  }) {
    this._getState = getState;
    this._onToggleLayer = onToggleLayer;
    this._onSelectLayer = onSelectLayer;
    this._onToggleGrid = onToggleGrid;
    this._subscribe = subscribe;
    this._unsubscribe = null;
    this._el = null;
    this._iconEl = null;
  }

  /**
   * Renders the panel into the given host element and starts syncing to state.
   * @param {HTMLElement} host
   */
  mount(host) {
    const panel = document.createElement("div");
    panel.className = "layer-vis-panel";
    this._el = panel;

    const icon = document.createElement("div");
    icon.className = "layer-vis-icon";
    this._iconEl = icon;
    panel.appendChild(icon);

    for (const layer of LAYERS) {
      const item = document.createElement("div");
      item.className = "layer-vis-item";
      item.dataset.layerItem = layer.id;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.layerCheckbox = layer.id;
      checkbox.addEventListener("change", () => {
        this._onToggleLayer(layer.id, checkbox.checked);
      });

      item.addEventListener("click", (e) => {
        if (e.target === checkbox) return;
        if (this._getState().mode === "terrain") {
          this._onSelectLayer(layer.id);
        }
      });

      const name = document.createElement("span");
      name.className = "layer-vis-name";
      name.textContent = layer.label;
      name.dataset.layerName = layer.id;

      item.appendChild(checkbox);
      item.appendChild(name);
      panel.appendChild(item);
    }

    const sep = document.createElement("div");
    sep.className = "layer-vis-sep";
    panel.appendChild(sep);

    const gridItem = document.createElement("div");
    gridItem.className = "layer-vis-item";

    const gridCheckbox = document.createElement("input");
    gridCheckbox.type = "checkbox";
    gridCheckbox.dataset.gridCheckbox = "";
    gridCheckbox.addEventListener("change", () => {
      this._onToggleGrid(gridCheckbox.checked);
    });

    const gridLabel = document.createElement("span");
    gridLabel.className = "layer-vis-name";
    gridLabel.textContent = "Grid";

    gridItem.appendChild(gridCheckbox);
    gridItem.appendChild(gridLabel);
    panel.appendChild(gridItem);

    host.appendChild(panel);

    this._unsubscribe = this._subscribe(() => this._syncFromState());
    this._syncFromState();
  }

  /**
   * Syncs panel DOM to current state without rebuilding nodes.
   */
  _syncFromState() {
    if (!this._el) return;
    const s = this._getState();

    this._el.dataset.mode = s.mode;

    for (const layer of LAYERS) {
      const item = this._el.querySelector(`[data-layer-item="${layer.id}"]`);
      const checkbox = this._el.querySelector(
        `[data-layer-checkbox="${layer.id}"]`,
      );
      if (!item || !checkbox) continue;

      const visible = s.visibleLayers[layer.id] ?? true;
      checkbox.checked = visible;

      const isActive = s.mode === "terrain" && s.activeLayer === layer.id;
      item.classList.toggle("is-active", isActive);
    }

    const gridCheckbox = this._el.querySelector("[data-grid-checkbox]");
    if (gridCheckbox) {
      gridCheckbox.checked = s.showGrid;
    }

    if (this._iconEl) {
      let frameX = 0;
      if (s.mode === "terrain") {
        if (s.activeLayer === "ground") frameX = -23;
        else if (s.activeLayer === "ground_detail") frameX = -46;
        else if (s.activeLayer === "fringe") frameX = -69;
      }
      this._iconEl.style.backgroundPositionX = `${frameX}px`;
    }
  }

  /**
   * Removes event subscriptions and clears the host element.
   */
  destroy() {
    this._unsubscribe?.();
    this._unsubscribe = null;
    if (this._el) {
      this._el.remove();
      this._el = null;
    }
  }
}
