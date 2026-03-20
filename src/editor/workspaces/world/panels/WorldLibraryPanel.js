export class WorldLibraryPanel {
  constructor({ el }) {
    this.el = el;

    // Maps state
    this._maps = [];
    this._selectedMapId = null;
    this._onMapSelected = null;
    this._usedMapIds = new Set();
    this._mapListEl = null;

    // Worlds state
    this._worlds = [];
    this._activeWorldId = null;
    this._onWorldSelected = null;
    this._onCreateWorld = null;
    this._onDeleteWorld = null;
    this._worldsEl = null;

    this._onMapClick = this._handleMapClick.bind(this);
    this._onWorldClick = this._handleWorldClick.bind(this);
  }

  // --- Maps API (unchanged behavior) ---

  setMaps(list) {
    this._maps = list;
    this._renderMaps();
  }

  setSelectedMapId(mapId) {
    this._selectedMapId = mapId;
    this._syncMaps();
  }

  setUsedMapIds(usedIds) {
    this._usedMapIds = usedIds;
    this._syncMaps();
  }

  hasMap(mapId) {
    return this._maps.some((m) => m.id === mapId);
  }

  addMap(mapObj) {
    if (!this._maps.some((m) => m.id === mapObj.id)) {
      this._maps.push(mapObj);
      this._renderMaps();
    }
  }

  onMapSelected(cb) {
    this._onMapSelected = cb;
  }

  // --- Worlds API ---

  renderWorldList(worlds, activeWorldId) {
    this._worlds = worlds;
    this._activeWorldId = activeWorldId;
    this._renderWorlds();
  }

  onWorldSelected(cb) { this._onWorldSelected = cb; }
  onCreateWorld(cb) { this._onCreateWorld = cb; }
  onDeleteWorld(cb) { this._onDeleteWorld = cb; }

  // --- Lifecycle ---

  destroy() {
    if (this._mapListEl) {
      this._mapListEl.removeEventListener("click", this._onMapClick);
    }
    this.el.innerHTML = "";
    this._mapListEl = null;
    this._worldsEl = null;
  }

  // --- Worlds rendering ---

  _renderWorlds() {
    if (this._worldsEl) {
      this._worldsEl.remove();
    }

    const container = document.createElement("div");
    container.className = "world-worlds-section";

    // Section label
    const label = document.createElement("div");
    label.className = "world-section-label";
    label.textContent = "Worlds";
    container.appendChild(label);

    // World list
    const list = document.createElement("div");
    list.className = "world-list";
    for (const world of this._worlds) {
      const item = document.createElement("div");
      item.className = "world-list-item";
      item.dataset.worldId = world.id;
      item.textContent = world.name;
      if (world.id === this._activeWorldId) {
        item.classList.add("is-active");
      }
      list.appendChild(item);
    }
    list.addEventListener("click", this._onWorldClick);
    container.appendChild(list);

    // Action buttons
    const actions = document.createElement("div");
    actions.className = "world-list-actions";

    const createBtn = document.createElement("button");
    createBtn.className = "world-list-btn";
    createBtn.textContent = "+ New World";
    createBtn.addEventListener("click", () => this._onCreateWorld?.());
    actions.appendChild(createBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "world-list-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => this._onDeleteWorld?.());
    actions.appendChild(deleteBtn);

    container.appendChild(actions);

    // Separator
    const sep = document.createElement("hr");
    sep.className = "world-section-separator";
    container.appendChild(sep);

    this._worldsEl = container;
    this.el.insertBefore(container, this.el.firstChild);
  }

  _handleWorldClick(e) {
    const item = e.target.closest("[data-world-id]");
    if (!item) return;
    this._onWorldSelected?.(item.dataset.worldId);
  }

  // --- Maps rendering ---

  _renderMaps() {
    // Remove old maps section if present
    if (this._mapsSection) {
      this._mapsSection.remove();
    }

    const section = document.createElement("div");
    section.className = "world-maps-section";

    // Section label
    const label = document.createElement("div");
    label.className = "world-section-label";
    label.textContent = "Maps";
    section.appendChild(label);

    // Map list
    const list = document.createElement("div");
    list.className = "world-library-list";
    for (const map of this._maps) {
      const item = document.createElement("div");
      item.className = "world-library-item";
      item.dataset.mapId = map.id;

      const nameEl = document.createElement("div");
      nameEl.className = "world-library-item-name";
      nameEl.textContent = map.name || map.id;
      item.appendChild(nameEl);

      if (map.width != null && map.height != null) {
        const metaEl = document.createElement("div");
        metaEl.className = "world-library-item-meta";
        metaEl.textContent = `${map.width} × ${map.height}`;
        item.appendChild(metaEl);
      }

      if (map.compatible === false) {
        item.classList.add("is-incompatible");
        const badge = document.createElement("span");
        badge.className = "world-library-badge-incompatible";
        badge.textContent = "incompatible";
        item.appendChild(badge);
      }

      list.appendChild(item);
    }
    list.addEventListener("click", this._onMapClick);
    this._mapListEl = list;
    section.appendChild(list);

    this._mapsSection = section;
    this.el.appendChild(section);
    this._syncMaps();
  }

  _syncMaps() {
    if (!this._mapListEl) return;
    const items = this._mapListEl.querySelectorAll(".world-library-item");
    for (const item of items) {
      item.classList.toggle("is-selected", item.dataset.mapId === this._selectedMapId);
      item.classList.toggle("is-used", this._usedMapIds.has(item.dataset.mapId));
    }
  }

  _handleMapClick(e) {
    const item = e.target.closest("[data-map-id]");
    if (!item) return;
    this._onMapSelected?.(item.dataset.mapId);
  }
}
