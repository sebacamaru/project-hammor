import { getGroupTiles } from "../../../../shared/data/TilesetUtils.js";
import "../styles/tileset-groups.css";

const ATLAS_CELL_SIZE = 24;

/**
 * Editable view of tileset editor groups with atlas preview.
 * Three-panel layout: group list (left) + detail (middle) + atlas canvas (right).
 */
export class TilesetGroupsView {
  /**
   * @param {object|null} tileset — Full tileset definition (from TilesetRegistry)
   * @param {object} [opts]
   * @param {(groups: object[]) => void} [opts.onSave] — Called with the current groups array when Save is clicked
   */
  constructor(tileset, { onSave } = {}) {
    this._tileset = tileset;
    this._groups = Array.isArray(tileset?.editor?.groups) ? tileset.editor.groups : [];
    this._selectedIndex = -1;
    this._selectedTileSet = new Set();
    this._hoverTileId = -1;
    this._atlasImg = null;
    this._onSave = onSave ?? null;

    this.el = document.createElement("div");
    this.el.className = "tileset-groups-view";

    this._build();
  }

  /**
   * Returns the display label for a group.
   * @param {object} group
   * @returns {string}
   */
  _getGroupLabel(group) {
    return group.name || group.id || "(unnamed group)";
  }

  /**
   * Returns the currently selected group, or null.
   * @returns {object|null}
   */
  _getSelectedGroup() {
    return this._groups[this._selectedIndex] ?? null;
  }

  /** @private */
  _build() {
    if (!this._tileset) {
      this.el.innerHTML = `<div class="tileset-groups-empty">No tileset is loaded for the current map.</div>`;
      return;
    }

    // Left column: toolbar + list
    const leftCol = document.createElement("div");
    leftCol.className = "tileset-groups-left";

    const toolbar = document.createElement("div");
    toolbar.className = "tileset-groups-toolbar";

    const addBtn = document.createElement("button");
    addBtn.className = "dialog-btn dialog-btn-confirm";
    addBtn.textContent = "+ New Group";
    addBtn.addEventListener("click", () => this._createGroup());
    toolbar.appendChild(addBtn);

    if (this._onSave) {
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "dialog-btn dialog-btn-confirm tileset-groups-save-btn";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", () => this._onSave(this._groups));
      toolbar.appendChild(saveBtn);
    }

    leftCol.appendChild(toolbar);

    this._listEl = document.createElement("div");
    this._listEl.className = "tileset-groups-list";
    leftCol.appendChild(this._listEl);
    this.el.appendChild(leftCol);

    // Middle column: detail
    this._detailEl = document.createElement("div");
    this._detailEl.className = "tileset-groups-detail";
    this.el.appendChild(this._detailEl);

    // Right column: atlas
    this._buildAtlas();

    this._renderList();

    if (this._groups.length > 0) {
      this._selectIndex(0);
    } else {
      this._renderEmptyDetail();
    }
  }

  // ── Atlas ──

  /** @private */
  _buildAtlas() {
    const { columns, rows, image } = this._tileset;
    const w = columns * ATLAS_CELL_SIZE;
    const h = (rows ?? 1) * ATLAS_CELL_SIZE;

    const wrapper = document.createElement("div");
    wrapper.className = "tileset-groups-atlas";

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "tileset-groups-atlas-canvases";
    canvasWrap.style.width = `${w}px`;
    canvasWrap.style.height = `${h}px`;

    // Base canvas — atlas image, drawn once
    this._atlasCanvas = document.createElement("canvas");
    this._atlasCanvas.width = w;
    this._atlasCanvas.height = h;
    canvasWrap.appendChild(this._atlasCanvas);

    // Overlay canvas — selection + hover, redrawn as needed
    this._overlayCanvas = document.createElement("canvas");
    this._overlayCanvas.width = w;
    this._overlayCanvas.height = h;
    canvasWrap.appendChild(this._overlayCanvas);

    // Hint text (shown when no group selected)
    this._atlasHint = document.createElement("div");
    this._atlasHint.className = "tileset-groups-atlas-hint";
    this._atlasHint.textContent = "Select a group to edit its tiles.";
    wrapper.appendChild(this._atlasHint);

    wrapper.appendChild(canvasWrap);
    this.el.appendChild(wrapper);

    // Mouse events on overlay canvas
    this._overlayCanvas.addEventListener("mousemove", (e) => this._onAtlasMouseMove(e));
    this._overlayCanvas.addEventListener("mouseleave", () => this._onAtlasMouseLeave());
    this._overlayCanvas.addEventListener("click", (e) => this._onAtlasClick(e));

    // Load atlas image
    this._atlasImg = new Image();
    this._atlasImg.onload = () => this._drawAtlasBase();
    this._atlasImg.onerror = () => {
      const ctx = this._atlasCanvas.getContext("2d");
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.fillText("Failed to load atlas", w / 2, h / 2);
    };
    this._atlasImg.src = image;

    this._syncAtlasHint();
  }

  /**
   * Draw the atlas image onto the base canvas. Called once on image load.
   * @private
   */
  _drawAtlasBase() {
    const ctx = this._atlasCanvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this._atlasImg, 0, 0, this._atlasCanvas.width, this._atlasCanvas.height);
    this._renderOverlay();
  }

  /**
   * Redraw the overlay canvas (selection highlights + hover).
   * @private
   */
  _renderOverlay() {
    const canvas = this._overlayCanvas;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const s = ATLAS_CELL_SIZE;

    // Selected tiles
    ctx.fillStyle = "rgba(79, 195, 247, 0.35)";
    for (const tileId of this._selectedTileSet) {
      const col = tileId % this._tileset.columns;
      const row = Math.floor(tileId / this._tileset.columns);
      ctx.fillRect(col * s, row * s, s, s);
    }

    // Hover
    if (this._hoverTileId >= 0) {
      const col = this._hoverTileId % this._tileset.columns;
      const row = Math.floor(this._hoverTileId / this._tileset.columns);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(col * s + 0.5, row * s + 0.5, s - 1, s - 1);
    }
  }

  /**
   * Compute tile ID from mouse event offset on the overlay canvas.
   * @param {MouseEvent} e
   * @returns {number} tileId or -1 if out of bounds
   * @private
   */
  _tileIdFromEvent(e) {
    const col = Math.floor(e.offsetX / ATLAS_CELL_SIZE);
    const row = Math.floor(e.offsetY / ATLAS_CELL_SIZE);
    const { columns, rows } = this._tileset;
    if (col < 0 || col >= columns || row < 0 || row >= (rows ?? columns)) return -1;
    return row * columns + col;
  }

  /** @private */
  _onAtlasMouseMove(e) {
    const tileId = this._tileIdFromEvent(e);
    if (tileId === this._hoverTileId) return;
    this._hoverTileId = tileId;
    this._renderOverlay();
  }

  /** @private */
  _onAtlasMouseLeave() {
    if (this._hoverTileId < 0) return;
    this._hoverTileId = -1;
    this._renderOverlay();
  }

  /** @private */
  _onAtlasClick(e) {
    const tileId = this._tileIdFromEvent(e);
    if (tileId < 0) return;
    this._toggleTile(tileId);
  }

  /**
   * Toggle a tile in the selected group.
   * @param {number} tileId
   * @private
   */
  _toggleTile(tileId) {
    const group = this._getSelectedGroup();
    if (!group) return;

    this._ensureExplicitTiles(group);

    if (this._selectedTileSet.has(tileId)) {
      this._selectedTileSet.delete(tileId);
    } else {
      this._selectedTileSet.add(tileId);
    }

    group.tiles = [...this._selectedTileSet];
    this._renderDetail(group);
    this._renderOverlay();
  }

  /**
   * Convert a legacy range group to explicit tiles[].
   * @param {object} group
   * @private
   */
  _ensureExplicitTiles(group) {
    if (Array.isArray(group.tiles)) return;
    group.tiles = getGroupTiles(group);
    delete group.startId;
    delete group.count;
  }

  /**
   * Show or hide the atlas hint based on selection state.
   * @private
   */
  _syncAtlasHint() {
    if (!this._atlasHint) return;
    this._atlasHint.style.display = this._getSelectedGroup() ? "none" : "";
  }

  // ── Group list ──

  /** @private */
  _renderList() {
    this._listEl.innerHTML = "";

    for (let i = 0; i < this._groups.length; i++) {
      const group = this._groups[i];
      const item = document.createElement("div");
      item.className = "tileset-groups-list-item";
      item.textContent = this._getGroupLabel(group);
      item.addEventListener("click", () => this._selectIndex(i));
      this._listEl.appendChild(item);
    }
  }

  /**
   * Select a group by index and update detail + atlas.
   * @param {number} index
   * @private
   */
  _selectIndex(index) {
    if (index < 0 || index >= this._groups.length) {
      this._selectedIndex = -1;
      this._selectedTileSet = new Set();
      this._renderEmptyDetail();
      this._syncAtlasHint();
      this._renderOverlay();
      return;
    }

    // Update list highlight
    const items = this._listEl.children;
    if (this._selectedIndex >= 0 && this._selectedIndex < items.length) {
      items[this._selectedIndex].classList.remove("is-selected");
    }
    this._selectedIndex = index;
    if (index < items.length) {
      items[index].classList.add("is-selected");
    }

    const group = this._groups[index];
    this._selectedTileSet = new Set(getGroupTiles(group));
    this._renderDetail(group);
    this._syncAtlasHint();
    this._renderOverlay();
  }

  /** @private */
  _renderEmptyDetail() {
    this._detailEl.innerHTML = `<div class="tileset-groups-empty">No group selected.</div>`;
  }

  // ── CRUD ──

  /** @private */
  _createGroup() {
    const group = { id: "", name: "New Group", tiles: [] };
    this._groups.push(group);
    this._renderList();
    this._selectIndex(this._groups.length - 1);
  }

  /** @private */
  _deleteGroup() {
    const group = this._getSelectedGroup();
    if (!group) return;

    const label = this._getGroupLabel(group);
    if (!window.confirm(`Delete group "${label}"?`)) return;

    const idx = this._selectedIndex;
    this._groups.splice(idx, 1);
    this._selectedIndex = -1;
    this._renderList();

    if (this._groups.length === 0) {
      this._selectedTileSet = new Set();
      this._renderEmptyDetail();
      this._syncAtlasHint();
      this._renderOverlay();
    } else if (idx < this._groups.length) {
      this._selectIndex(idx);
    } else {
      this._selectIndex(this._groups.length - 1);
    }
  }

  // ── Detail panel ──

  /**
   * Render the editable detail panel for a group.
   * @param {object} group
   * @private
   */
  _renderDetail(group) {
    const tileIds = getGroupTiles(group);
    const format = this._detectFormat(group);

    let preview = "";
    if (tileIds.length > 0) {
      const shown = tileIds.slice(0, 8).join(", ");
      preview = tileIds.length > 8 ? `${shown}, \u2026` : shown;
    }

    this._detailEl.innerHTML = "";

    // Name input
    this._detailEl.appendChild(this._buildField("Name", group.name ?? "", (value) => {
      const g = this._getSelectedGroup();
      if (!g) return;
      g.name = value;
      this._refreshSelectedListItem();
    }));

    // ID input
    this._detailEl.appendChild(this._buildField("ID", group.id ?? "", (value) => {
      const g = this._getSelectedGroup();
      if (!g) return;
      g.id = value;
      this._refreshSelectedListItem();
    }));

    // Read-only rows
    const readOnlyRows = [
      { label: "Tiles", value: String(tileIds.length) },
      { label: "Format", value: format },
    ];
    if (preview) {
      readOnlyRows.push({ label: "Preview", value: preview });
    }

    for (const { label, value } of readOnlyRows) {
      const row = document.createElement("div");
      row.className = "tileset-groups-detail-row";

      const labelEl = document.createElement("span");
      labelEl.className = "tileset-groups-detail-label";
      labelEl.textContent = label;

      const valueEl = document.createElement("span");
      valueEl.className = "tileset-groups-detail-value";
      valueEl.textContent = value;

      row.appendChild(labelEl);
      row.appendChild(valueEl);
      this._detailEl.appendChild(row);
    }

    // Delete button
    const deleteArea = document.createElement("div");
    deleteArea.className = "tileset-groups-delete-area";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "dialog-btn dialog-btn-confirm is-danger";
    deleteBtn.textContent = "Delete Group";
    deleteBtn.addEventListener("click", () => this._deleteGroup());

    deleteArea.appendChild(deleteBtn);
    this._detailEl.appendChild(deleteArea);
  }

  /**
   * Build an editable field row (label + input).
   * @param {string} label
   * @param {string} value
   * @param {(value: string) => void} onChange
   * @returns {HTMLElement}
   * @private
   */
  _buildField(label, value, onChange) {
    const row = document.createElement("div");
    row.className = "tileset-groups-detail-row";

    const labelEl = document.createElement("span");
    labelEl.className = "tileset-groups-detail-label";
    labelEl.textContent = label;

    const input = document.createElement("input");
    input.className = "tileset-groups-input";
    input.type = "text";
    input.value = value;
    input.spellcheck = false;
    input.autocomplete = "off";
    input.addEventListener("input", () => onChange(input.value));

    row.appendChild(labelEl);
    row.appendChild(input);
    return row;
  }

  /** @private */
  _refreshSelectedListItem() {
    const group = this._getSelectedGroup();
    if (!group) return;
    const item = this._listEl.children[this._selectedIndex];
    if (item) {
      item.textContent = this._getGroupLabel(group);
    }
  }

  /**
   * Detect the format of a group definition.
   * @param {object} group
   * @returns {"explicit"|"range"|"unknown"}
   * @private
   */
  _detectFormat(group) {
    if (Array.isArray(group?.tiles)) return "explicit";
    if (
      Number.isInteger(group?.startId) &&
      Number.isInteger(group?.count) &&
      group.count > 0
    ) {
      return "range";
    }
    return "unknown";
  }
}
