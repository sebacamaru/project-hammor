import { getGroupTiles } from "../../../../shared/data/TilesetUtils.js";
import { createIconEl } from "../../../shared/ui/editorIcons.js";
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
   * @param {() => void} [opts.onCancel] — Called when the Cancel button is clicked (user-initiated, should trigger requestClose on the host modal)
   * @param {() => void} [opts.onSaveSuccess] — Called after a successful save (should call close() on the host modal to bypass the onBeforeClose guard)
   * @param {(opts: {title: string, message: string, confirmLabel?: string, cancelLabel?: string, tone?: string}) => Promise<boolean>} [opts.confirm]
   *   Custom confirm dialog function. When provided, used instead of window.confirm for destructive actions
   *   like deleting groups. Pass editor.confirm from the host workspace for a consistent UI.
   *   Falls back to window.confirm if not provided.
   */
  constructor(tileset, { onSave, onCancel, onSaveSuccess, confirm } = {}) {
    this._tileset = tileset;
    this._groups = structuredClone(tileset?.editor?.groups ?? []);
    this._selectedIndex = -1;
    this._selectedTileSet = new Set();
    this._hoverTileId = -1;
    this._atlasImg = null;
    this._onSave = onSave ?? null;
    this._onCancel = onCancel ?? null;
    this._onSaveSuccess = onSaveSuccess ?? null;
    this._confirm = confirm ?? null;
    this._saveBtn = null;
    this._footerEl = null;
    this._isDirty = false;
    this._initialSnapshot = this._serializeGroups(this._groups);

    this._isDragging = false;
    this._dragStartTileId = -1;
    this._dragCurrentTileId = -1;
    this._dragMode = "replace";

    this._onKeyDown = this._handleKeyDown.bind(this);
    window.addEventListener("keydown", this._onKeyDown, true);

    this._onMouseUp = this._onAtlasMouseUp.bind(this);
    window.addEventListener("mouseup", this._onMouseUp);

    this.el = document.createElement("div");
    this.el.className = "tileset-groups-view";

    this._build();
    this._buildFooter();
  }

  /** @returns {boolean} Whether the view has unsaved changes. */
  get isDirty() {
    return this._isDirty;
  }

  /** @returns {HTMLElement} Footer element with Cancel + Save buttons for use in a modal footer slot. */
  get footerEl() {
    return this._footerEl;
  }

  // ── Dirty state ──

  /**
   * Serialize groups array to a JSON string for snapshot comparison.
   * @param {object[]} groups
   * @returns {string}
   * @private
   */
  _serializeGroups(groups) {
    return JSON.stringify(groups ?? []);
  }

  /**
   * Recompute dirty state by comparing current groups to the initial snapshot.
   * @private
   */
  _refreshDirtyState() {
    this._isDirty = this._serializeGroups(this._groups) !== this._initialSnapshot;
    this._updateSaveButton();
  }

  /**
   * Update the Save button text and disabled state based on dirty flag.
   * @private
   */
  _updateSaveButton() {
    if (!this._saveBtn) return;
    this._saveBtn.textContent = this._isDirty ? "Save *" : "Save";
    this._saveBtn.disabled = !this._isDirty;
  }

  /**
   * Reset the initial snapshot to the current state (called after successful save).
   */
  markSaved() {
    this._initialSnapshot = this._serializeGroups(this._groups);
    this._refreshDirtyState();
  }

  /**
   * Handle Save button click — save if dirty, mark clean and notify on success.
   * @private
   */
  async _handleSave() {
    if (!this._isDirty || !this._onSave) return;
    try {
      await this._onSave(this._groups);
      this.markSaved();
      this._onSaveSuccess?.();
    } catch (error) {
      console.error("Failed to save tileset groups", error);
    }
  }

  /**
   * Handle global keydown — Ctrl+S / Cmd+S triggers save.
   * @param {KeyboardEvent} event
   * @private
   */
  _handleKeyDown(event) {
    if (event.defaultPrevented) return;
    const isSave = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s";
    if (!isSave) return;
    event.preventDefault();
    event.stopPropagation();
    this._handleSave();
  }

  /**
   * Clean up global listeners. Must be called when the view is removed.
   */
  destroy() {
    window.removeEventListener("keydown", this._onKeyDown, true);
    window.removeEventListener("mouseup", this._onMouseUp);
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
    addBtn.className = "editor-btn editor-btn--primary editor-btn--sm";
    addBtn.textContent = "+ New Group";
    addBtn.addEventListener("click", () => this._createGroup());
    toolbar.appendChild(addBtn);

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

  /**
   * Build the footer element with Cancel and Save buttons.
   * Stored as this._footerEl; exposed publicly via the footerEl getter.
   * @private
   */
  _buildFooter() {
    this._footerEl = document.createElement("div");
    this._footerEl.className = "tileset-groups-footer";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "editor-btn editor-btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => this._onCancel?.());

    this._saveBtn = document.createElement("button");
    this._saveBtn.type = "button";
    this._saveBtn.className = "editor-btn editor-btn--primary";
    this._saveBtn.addEventListener("click", () => this._handleSave());
    this._updateSaveButton();

    this._footerEl.appendChild(cancelBtn);
    this._footerEl.appendChild(this._saveBtn);
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
    this._overlayCanvas.addEventListener("mousedown", (e) => this._onAtlasMouseDown(e));
    this._overlayCanvas.addEventListener("mousemove", (e) => this._onAtlasMouseMove(e));
    this._overlayCanvas.addEventListener("mouseleave", () => this._onAtlasMouseLeave());

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

    // Drag preview rectangle
    if (this._isDragging && this._dragStartTileId >= 0 && this._dragCurrentTileId >= 0) {
      const colA = this._dragStartTileId % this._tileset.columns;
      const rowA = Math.floor(this._dragStartTileId / this._tileset.columns);
      const colB = this._dragCurrentTileId % this._tileset.columns;
      const rowB = Math.floor(this._dragCurrentTileId / this._tileset.columns);
      const x = Math.min(colA, colB) * s;
      const y = Math.min(rowA, rowB) * s;
      const w = (Math.abs(colB - colA) + 1) * s;
      const h = (Math.abs(rowB - rowA) + 1) * s;

      ctx.fillStyle = "rgba(79, 195, 247, 0.18)";
      ctx.strokeStyle = "rgba(79, 195, 247, 0.7)";
      ctx.lineWidth = 2;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
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

  /**
   * Start a drag selection on the atlas.
   * @param {MouseEvent} e
   * @private
   */
  _onAtlasMouseDown(e) {
    const tileId = this._tileIdFromEvent(e);
    if (tileId < 0 || !this._getSelectedGroup()) return;

    this._isDragging = true;
    this._dragStartTileId = tileId;
    this._dragCurrentTileId = tileId;
    this._dragMode = e.shiftKey ? "remove" : e.altKey ? "replace" : "add";
    this._renderOverlay();
  }

  /** @private */
  _onAtlasMouseMove(e) {
    const tileId = this._tileIdFromEvent(e);

    if (this._isDragging) {
      if (tileId >= 0 && tileId !== this._dragCurrentTileId) {
        this._dragCurrentTileId = tileId;
        this._renderOverlay();
      }
      return;
    }

    if (tileId === this._hoverTileId) return;
    this._hoverTileId = tileId;
    this._renderOverlay();
  }

  /** @private */
  _onAtlasMouseLeave() {
    if (this._isDragging) return;
    if (this._hoverTileId < 0) return;
    this._hoverTileId = -1;
    this._renderOverlay();
  }

  /**
   * Finish a drag selection. Bound to window so release outside canvas works.
   * @private
   */
  _onAtlasMouseUp() {
    if (!this._isDragging) return;

    const startId = this._dragStartTileId;
    const endId = this._dragCurrentTileId;

    this._isDragging = false;
    this._dragStartTileId = -1;
    this._dragCurrentTileId = -1;

    if (startId === endId) {
      this._toggleTile(startId);
      return;
    }

    this._applyDragSelection(startId, endId);
    this._renderOverlay();
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
    this._refreshDirtyState();
  }

  /**
   * Return all tile IDs inside the rectangle defined by two corner tiles.
   * @param {number} startId
   * @param {number} endId
   * @returns {number[]}
   * @private
   */
  _getRectTileIds(startId, endId) {
    const cols = this._tileset.columns;
    const colA = startId % cols;
    const rowA = Math.floor(startId / cols);
    const colB = endId % cols;
    const rowB = Math.floor(endId / cols);

    const minCol = Math.min(colA, colB);
    const maxCol = Math.max(colA, colB);
    const minRow = Math.min(rowA, rowB);
    const maxRow = Math.max(rowA, rowB);

    const ids = [];
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        ids.push(row * cols + col);
      }
    }
    return ids;
  }

  /**
   * Apply a completed drag rectangle to the selected group's tile set.
   * @param {number} startId
   * @param {number} endId
   * @private
   */
  _applyDragSelection(startId, endId) {
    const group = this._getSelectedGroup();
    if (!group) return;

    this._ensureExplicitTiles(group);
    const rectTiles = this._getRectTileIds(startId, endId);

    if (this._dragMode === "replace") {
      this._selectedTileSet = new Set(rectTiles);
    } else if (this._dragMode === "add") {
      for (const id of rectTiles) this._selectedTileSet.add(id);
    } else if (this._dragMode === "remove") {
      for (const id of rectTiles) this._selectedTileSet.delete(id);
    }

    group.tiles = [...this._selectedTileSet];
    this._renderDetail(group);
    this._refreshDirtyState();
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

      const labelSpan = document.createElement("span");
      labelSpan.className = "tileset-groups-item-label";
      labelSpan.textContent = this._getGroupLabel(group);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "tileset-groups-item-delete";
      deleteBtn.title = "Delete group";
      const icon = createIconEl("eraser");
      if (icon) deleteBtn.appendChild(icon);
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._deleteGroup(i);
      });

      item.appendChild(labelSpan);
      item.appendChild(deleteBtn);
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
    this._refreshDirtyState();
  }

  /**
   * Delete a group by index. Shows a confirmation before proceeding.
   * Uses the custom confirm dialog if available (opts.confirm), otherwise falls back to window.confirm.
   * Adjusts the selected index so selection remains stable for non-selected deletes.
   * @param {number} index
   * @private
   */
  async _deleteGroup(index) {
    const group = this._groups[index];
    if (!group) return;

    const label = this._getGroupLabel(group);
    let confirmed;
    if (this._confirm) {
      confirmed = await this._confirm({
        title: "Delete group",
        message: `Delete group "${label}"? This cannot be undone.`,
        confirmLabel: "Delete",
        tone: "danger",
      });
    } else {
      confirmed = window.confirm(`Delete group "${label}"?`);
    }
    if (!confirmed) return;

    const wasSelected = this._selectedIndex === index;

    // Adjust selected index before splicing
    if (this._selectedIndex > index) {
      this._selectedIndex--;
    } else if (wasSelected) {
      this._selectedIndex = -1;
    }

    this._groups.splice(index, 1);
    this._renderList();

    // Re-apply selection highlight
    if (this._selectedIndex >= 0 && this._selectedIndex < this._listEl.children.length) {
      this._listEl.children[this._selectedIndex].classList.add("is-selected");
    }

    if (this._groups.length === 0) {
      this._selectedIndex = -1;
      this._selectedTileSet = new Set();
      this._renderEmptyDetail();
      this._syncAtlasHint();
      this._renderOverlay();
    } else if (wasSelected) {
      this._selectIndex(Math.min(index, this._groups.length - 1));
    } else {
      // Non-selected group deleted; current selection is still valid, just refresh detail
      this._renderDetail(this._groups[this._selectedIndex]);
    }

    this._refreshDirtyState();
  }

  // ── Detail panel ──

  /**
   * Render the editable detail panel for a group.
   * @param {object} group
   * @private
   */
  _renderDetail(group) {
    const tileIds = getGroupTiles(group);

    this._detailEl.innerHTML = "";

    // Name input
    this._detailEl.appendChild(this._buildField("Name", group.name ?? "", (value) => {
      const g = this._getSelectedGroup();
      if (!g) return;
      g.name = value;
      this._refreshSelectedListItem();
      this._refreshDirtyState();
    }));

    // ID input
    this._detailEl.appendChild(this._buildField("ID", group.id ?? "", (value) => {
      const g = this._getSelectedGroup();
      if (!g) return;
      g.id = value;
      this._refreshSelectedListItem();
      this._refreshDirtyState();
    }));

    // Tiles count (read-only)
    const tilesRow = document.createElement("div");
    tilesRow.className = "tileset-groups-detail-row";

    const tilesLabel = document.createElement("span");
    tilesLabel.className = "tileset-groups-detail-label";
    tilesLabel.textContent = "Tiles";

    const tilesValue = document.createElement("span");
    tilesValue.className = "tileset-groups-detail-value";
    tilesValue.textContent = String(tileIds.length);

    tilesRow.appendChild(tilesLabel);
    tilesRow.appendChild(tilesValue);
    this._detailEl.appendChild(tilesRow);
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
      const label = item.querySelector(".tileset-groups-item-label");
      if (label) label.textContent = this._getGroupLabel(group);
    }
  }

}
