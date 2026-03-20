export class WorldLibraryPanel {
  constructor({ el }) {
    this.el = el;
    this._maps = [];
    this._selectedMapId = null;
    this._onMapSelected = null;

    this._usedMapIds = new Set();
    this._list = null;
    this._onClick = this._handleClick.bind(this);
  }

  setMaps(list) {
    this._maps = list;
    this._render();
  }

  setSelectedMapId(mapId) {
    this._selectedMapId = mapId;
    this._sync();
  }

  setUsedMapIds(usedIds) {
    this._usedMapIds = usedIds;
    this._sync();
  }

  hasMap(mapId) {
    return this._maps.includes(mapId);
  }

  addMap(mapId) {
    if (!this._maps.includes(mapId)) {
      this._maps.push(mapId);
      this._render();
    }
  }

  onMapSelected(cb) {
    this._onMapSelected = cb;
  }

  destroy() {
    if (this._list) {
      this._list.removeEventListener("click", this._onClick);
    }
    this.el.innerHTML = "";
    this._list = null;
  }

  // --- private ---

  _render() {
    this.el.innerHTML = "";

    const list = document.createElement("div");
    list.className = "world-library-list";

    for (const mapId of this._maps) {
      const item = document.createElement("div");
      item.className = "world-library-item";
      item.dataset.mapId = mapId;
      item.textContent = mapId;
      list.appendChild(item);
    }

    list.addEventListener("click", this._onClick);
    this._list = list;
    this.el.appendChild(list);
    this._sync();
  }

  _sync() {
    if (!this._list) return;
    const items = this._list.querySelectorAll(".world-library-item");
    for (const item of items) {
      item.classList.toggle("is-selected", item.dataset.mapId === this._selectedMapId);
      item.classList.toggle("is-used", this._usedMapIds.has(item.dataset.mapId));
    }
  }

  _handleClick(e) {
    const item = e.target.closest("[data-map-id]");
    if (!item) return;
    this._onMapSelected?.(item.dataset.mapId);
  }
}
