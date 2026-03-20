import "./styles/world-editor.css";

import { WorldDocument } from "./WorldDocument.js";
import { WorldEditorState } from "./WorldEditorState.js";
import { WorldHistory } from "./WorldHistory.js";
import { WorldGridView } from "./WorldGridView.js";
import { WorldLibraryPanel } from "./panels/WorldLibraryPanel.js";
import { WorldInspectorPanel } from "./panels/WorldInspectorPanel.js";
import { EDITOR_SERVER_ORIGIN } from "../map/MapEditorConfig.js";

export class WorldEditorApp {
  constructor() {
    this.host = null;
    this.root = null;
    this.document = null;
    this.state = null;
    this.history = null;
    this.isDirty = false;

    this.gridView = null;
    this.libraryPanel = null;
    this.inspectorPanel = null;
    this._gridResizeObserver = null;
    this._undoBtn = null;
    this._redoBtn = null;
    this._onKeyDown = null;
    this._onRootPointerDown = null;

    this.worlds = [];
    this.activeWorldId = null;
    this._worldCounter = 0;
    this._mapCatalog = [];
    this._isMounted = false;

    this.statusMessage = "";
    this._statusVersion = 0;
    this._statusTimeout = null;
    this._statusEl = null;
  }

  async mount(host, editor) {
    this._isMounted = true;
    this.host = host;
    this.editor = editor || null;

    const defaultWorld = this._createWorldData({ id: "main_world", name: "Main World" });
    this.worlds = [defaultWorld];
    this.activeWorldId = defaultWorld.id;
    this.document = new WorldDocument(defaultWorld);

    this.state = new WorldEditorState();
    this.history = new WorldHistory();

    // Build layout skeleton
    this.root = document.createElement("div");
    this.root.className = "world-editor";
    this.root.innerHTML = `
      <aside class="world-panel world-panel-library">
        <div class="world-panel-header">Library</div>
        <div class="world-panel-body" data-slot="library"></div>
      </aside>
      <main class="world-panel world-panel-grid">
        <div class="world-panel-header">World <button class="world-header-btn world-redo-btn" title="Redo (Ctrl+Y)" disabled>↷</button><button class="world-header-btn world-undo-btn" title="Undo (Ctrl+Z)" disabled>↶</button><button class="world-header-btn world-center-btn" title="Center View">⊙</button></div>
        <div class="world-panel-body" data-slot="grid"></div>
      </main>
      <aside class="world-panel world-panel-inspector">
        <div class="world-panel-header">Inspector</div>
        <div class="world-panel-body" data-slot="inspector"></div>
      </aside>
    `;
    this.host.appendChild(this.root);

    // Make root focusable for keyboard shortcut scoping
    this.root.tabIndex = 0;
    this.root.style.outline = "none";
    this._onRootPointerDown = () => this.root.focus();
    this.root.addEventListener("pointerdown", this._onRootPointerDown);

    const gridSlot = this.root.querySelector('[data-slot="grid"]');
    const librarySlot = this.root.querySelector('[data-slot="library"]');
    const inspectorSlot = this.root.querySelector('[data-slot="inspector"]');

    // Status element (inside grid slot, absolute positioned)
    this._statusEl = document.createElement("div");
    this._statusEl.className = "world-status";
    gridSlot.appendChild(this._statusEl);

    // Grid view
    this.gridView = new WorldGridView({
      document: this.document,
      state: this.state,
    });
    this.gridView.mount(gridSlot);
    this.gridView.setCompatibilityCheck((mapId) => this._isMapCompatible(mapId));

    this.gridView.onHover((cell) => {
      this.state.hoverCell = cell;
      this.inspectorPanel.renderCellInfo({
        selectedCell: this.state.selectedCell,
        hoverCell: cell,
        document: this.document,
        selectedMapId: this.state.selectedMapId,
        isSelectedMapCompatible: this.state.selectedMapId ? this._isMapCompatible(this.state.selectedMapId) : false,
      });
      this.gridView.render();
    });

    this.gridView.onSelect((cell) => {
      this.state.selectedCell = cell;
      const { selectedMapId } = this.state;
      const didMutate = selectedMapId
        && !this.document.hasCell(cell.rx, cell.ry)
        && this._assignMapToCell(cell.rx, cell.ry, selectedMapId);
      if (didMutate) {
        this._renderAll();
        this._syncHistoryButtons();
        this._setStatus("Map assigned");
      } else {
        this.gridView.render();
        this.inspectorPanel.renderCellInfo({
          selectedCell: cell,
          hoverCell: this.state.hoverCell,
          document: this.document,
          selectedMapId: this.state.selectedMapId,
          isSelectedMapCompatible: selectedMapId ? this._isMapCompatible(selectedMapId) : false,
        });
      }
    });

    this._gridResizeObserver = new ResizeObserver(() => {
      this.gridView.resize();
    });
    this._gridResizeObserver.observe(gridSlot);

    // Library panel
    this.libraryPanel = new WorldLibraryPanel({ el: librarySlot });
    this.libraryPanel.setMaps([]);
    this.libraryPanel.renderWorldList(this.worlds, this.activeWorldId);
    this._fetchMapCatalog();

    this.libraryPanel.onWorldSelected((worldId) => this._loadWorld(worldId));
    this.libraryPanel.onCreateWorld(() => this._createWorld());
    this.libraryPanel.onDeleteWorld(() => this._deleteActiveWorld());

    this.libraryPanel.onMapSelected((mapId) => {
      this.state.selectedMapId = mapId;
      this.libraryPanel.setSelectedMapId(mapId);
      this.inspectorPanel.renderMapInfo(this._getMapMeta(mapId));
      this.inspectorPanel.renderCellInfo({
        selectedCell: this.state.selectedCell,
        hoverCell: this.state.hoverCell,
        document: this.document,
        selectedMapId: mapId,
        isSelectedMapCompatible: mapId ? this._isMapCompatible(mapId) : false,
      });
      this.gridView.render();
    });

    // Inspector panel
    this.inspectorPanel = new WorldInspectorPanel({ el: inspectorSlot });
    this.inspectorPanel.renderWorldInfo(this.document);
    this.inspectorPanel.renderCellInfo({
      selectedCell: null,
      hoverCell: null,
      document: this.document,
      selectedMapId: null,
      isSelectedMapCompatible: false,
    });
    this.inspectorPanel.renderMapInfo(null);

    this.inspectorPanel.onAssignRequested(() => {
      const { selectedCell, selectedMapId } = this.state;
      if (!selectedCell || !selectedMapId) return;
      if (this._assignMapToCell(selectedCell.rx, selectedCell.ry, selectedMapId)) {
        this._renderAll();
        this._syncHistoryButtons();
        this._setStatus("Map assigned");
      }
    });

    this.inspectorPanel.onRemoveRequested(() => {
      const { selectedCell } = this.state;
      if (!selectedCell) return;
      if (this._removeCell(selectedCell.rx, selectedCell.ry)) {
        this._renderAll();
        this._syncHistoryButtons();
        this._setStatus("Map removed");
      }
    });

    this.inspectorPanel.onReplaceRequested(() => {
      const { selectedCell, selectedMapId } = this.state;
      if (!selectedCell || !selectedMapId) return;
      if (this._replaceCell(selectedCell.rx, selectedCell.ry, selectedMapId)) {
        this._renderAll();
        this._syncHistoryButtons();
        this._setStatus("Map replaced");
      }
    });

    this.inspectorPanel.onCreateMapRequested(() => {
      const { selectedCell } = this.state;
      if (!selectedCell) return;
      const { rx, ry } = selectedCell;
      const newMapId = this._generateMapId();
      if (!this.document.canAssignMap(rx, ry, newMapId)) return;
      const prev = this.document.getCell(rx, ry);
      const before = prev ? { mapId: prev.mapId } : null;
      this.document.setCell(rx, ry, { mapId: newMapId });
      this.history.push({ type: "create", rx, ry, before, after: { mapId: newMapId } });
      this.isDirty = true;
      this.state.selectedMapId = newMapId;
      const ms = this.document.getMapSize();
      const entry = { id: newMapId, name: newMapId, width: ms.width, height: ms.height };
      this._mapCatalog.push(entry);
      this.libraryPanel.setMaps(this._getLibraryMaps());
      this.libraryPanel.setSelectedMapId(newMapId);
      this._renderAll();
      this._syncHistoryButtons();
      this._setStatus("Map created and assigned");
    });

    this.inspectorPanel.onOpenMapRequested(() => {
      const { selectedCell } = this.state;
      if (!selectedCell) return;
      const cell = this.document.getCell(selectedCell.rx, selectedCell.ry);
      if (!cell) return;
      if (this.editor?.openMap) {
        this.editor.openMap(cell.mapId);
      } else {
        console.log("[WorldEditor] Open map:", cell.mapId);
        this._setStatus(`Open map: ${cell.mapId} (not yet integrated)`);
      }
    });

    this.inspectorPanel.onNameChanged((name) => {
      this.document.setName(name);
      this.isDirty = true;
      this._saveActiveWorldState();
      this.libraryPanel.renderWorldList(this.worlds, this.activeWorldId);
      this._setStatus("World name updated");
    });

    this.inspectorPanel.onMapSizeChanged(({ width, height }) => {
      const accepted = this.document.setMapSize(width, height);
      if (!accepted) return;
      this.isDirty = true;
      this._saveActiveWorldState();
      this.libraryPanel.setMaps(this._getLibraryMaps());
      this._renderAll();
      this._setStatus("Map size updated");
    });

    // Center button
    this.root.querySelector(".world-center-btn")
      .addEventListener("click", () => this.gridView.centerOnContent());

    // Undo/redo buttons
    this._undoBtn = this.root.querySelector(".world-undo-btn");
    this._redoBtn = this.root.querySelector(".world-redo-btn");
    this._undoBtn.addEventListener("click", () => this._undo());
    this._redoBtn.addEventListener("click", () => this._redo());

    // Keyboard shortcuts (scoped to this workspace via focus)
    this._onKeyDown = (e) => {
      if (!this.root || document.activeElement !== this.root) return;

      // Modifier shortcuts (Ctrl/Cmd)
      if (e.ctrlKey || e.metaKey) {
        if (e.code === "KeyZ" && !e.shiftKey) {
          e.preventDefault();
          this._undo();
        } else if (e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey)) {
          e.preventDefault();
          this._redo();
        }
        return;
      }

      // Plain key shortcuts
      switch (e.code) {
        case "KeyF":
          e.preventDefault();
          this._centerView();
          break;
        case "Digit1":
          e.preventDefault();
          this._setActiveTool("place");
          break;
        case "Digit2":
          e.preventDefault();
          this._setActiveTool("replace");
          break;
        case "Digit3":
          e.preventDefault();
          this._setActiveTool("erase");
          break;
        case "KeyG":
          e.preventDefault();
          this._toggleGrid();
          break;
      }
    };
    window.addEventListener("keydown", this._onKeyDown);

    // Initial library used state
    this._syncLibraryUsed();
    this._syncHistoryButtons();

    // Center view on content
    this.gridView.centerOnContent();
  }

  unmount() {
    this._isMounted = false;

    if (this._onKeyDown) {
      window.removeEventListener("keydown", this._onKeyDown);
      this._onKeyDown = null;
    }

    if (this._statusTimeout) {
      clearTimeout(this._statusTimeout);
      this._statusTimeout = null;
    }

    this._gridResizeObserver?.disconnect();
    this._gridResizeObserver = null;

    this.gridView?.unmount();
    this.libraryPanel?.destroy();
    this.inspectorPanel?.destroy();

    this.gridView = null;
    this.libraryPanel = null;
    this.inspectorPanel = null;
    this._undoBtn = null;
    this._redoBtn = null;
    this._statusEl = null;

    if (this.root) {
      this.root.removeEventListener("pointerdown", this._onRootPointerDown);
      this._onRootPointerDown = null;
      if (this.root.parentNode) {
        this.root.parentNode.removeChild(this.root);
      }
    }
    this.root = null;
    this.host = null;
    this.editor = null;
    this.document = null;
    this.state = null;
  }

  resize(width, height) {}

  update(dt) {}

  async save() {
    console.log("[WorldEditorApp.save]", this.document.toJSON());
    this.isDirty = false;
    this._setStatus("World saved (mock)");
  }

  canSave() {
    return true;
  }

  getTitle() {
    return "World";
  }

  // --- world management ---

  _createWorldData(overrides = {}) {
    this._worldCounter++;
    return {
      id: `world_${this._worldCounter}`,
      name: `World ${this._worldCounter}`,
      version: 1,
      mapSize: { width: 128, height: 128 },
      cells: {},
      ...overrides,
    };
  }

  _saveActiveWorldState() {
    const idx = this.worlds.findIndex(w => w.id === this.activeWorldId);
    if (idx >= 0) {
      this.worlds[idx] = this.document.toJSON();
    }
  }

  _loadWorld(worldId) {
    if (worldId === this.activeWorldId) return;
    const worldData = this.worlds.find(w => w.id === worldId);
    if (!worldData) return;

    if (this.activeWorldId) this._saveActiveWorldState();

    this.activeWorldId = worldId;
    this.document = new WorldDocument(worldData);
    this.state.selectedCell = null;
    this.state.hoverCell = null;
    this.state.selectedMapId = null;
    this.history.clear();
    this.isDirty = false;

    this.gridView.setDocument(this.document);
    this.libraryPanel.setMaps(this._getLibraryMaps());
    this.inspectorPanel.renderMapInfo(null);
    this._renderAll();
    this._syncHistoryButtons();
    this.gridView.centerOnContent();
    this.libraryPanel.renderWorldList(this.worlds, this.activeWorldId);
    this.libraryPanel.setSelectedMapId(null);
    this._setStatus("World loaded");
  }

  _createWorld() {
    if (this.activeWorldId) this._saveActiveWorldState();
    const data = this._createWorldData();
    this.worlds.push(data);
    this.activeWorldId = null; // prevent double-save in _loadWorld
    this._loadWorld(data.id);
    this._setStatus("World created");
  }

  async _deleteActiveWorld() {
    const name = this.document.name || this.document.id || "this world";
    const ok = await this.editor.confirm({
      title: "Delete World",
      message: `Delete "${name}"? This will not delete its maps.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!ok) return;

    const idx = this.worlds.findIndex(w => w.id === this.activeWorldId);
    this.worlds.splice(idx, 1);

    if (this.worlds.length === 0) {
      const data = this._createWorldData();
      this.worlds.push(data);
    }

    const nextIdx = Math.min(idx, this.worlds.length - 1);
    this.activeWorldId = null; // prevent _saveActiveWorldState in _loadWorld
    this._loadWorld(this.worlds[nextIdx].id);
    this._setStatus("World deleted");
  }

  // --- document mutations ---

  _getMapMeta(mapId) {
    if (!mapId) return null;
    return this._mapCatalog.find(m => m.id === mapId) || null;
  }

  _isMapCompatible(mapId) {
    const mapSize = this.document?.getMapSize();
    if (!mapSize || mapSize.width == null || mapSize.height == null) return false;
    const map = this._mapCatalog.find(m => m.id === mapId);
    if (!map || map.width == null || map.height == null) return false;
    return map.width === mapSize.width && map.height === mapSize.height;
  }

  _getLibraryMaps() {
    const mapSize = this.document?.getMapSize();
    const hasValidSize = mapSize && mapSize.width != null && mapSize.height != null;
    return this._mapCatalog.map(m => ({
      ...m,
      compatible: hasValidSize
        && m.width != null && m.height != null
        && m.width === mapSize.width && m.height === mapSize.height,
    }));
  }

  _assignMapToCell(rx, ry, mapId) {
    if (!this._isMapCompatible(mapId)) return false;
    if (!this.document.canAssignMap(rx, ry, mapId)) return false;
    const prev = this.document.getCell(rx, ry);
    const before = prev ? { mapId: prev.mapId } : null;
    this.document.setCell(rx, ry, { mapId });
    this.history.push({ type: "assign", rx, ry, before, after: { mapId } });
    this.isDirty = true;
    return true;
  }

  _removeCell(rx, ry) {
    if (!this.document.hasCell(rx, ry)) return false;
    const before = { mapId: this.document.getCell(rx, ry).mapId };
    this.document.removeCell(rx, ry);
    this.history.push({ type: "remove", rx, ry, before, after: null });
    this.isDirty = true;
    return true;
  }

  _replaceCell(rx, ry, mapId) {
    if (!this.document.hasCell(rx, ry)) return false;
    if (!mapId) return false;
    if (!this._isMapCompatible(mapId)) return false;
    const current = this.document.getCell(rx, ry);
    if (current.mapId === mapId) return false;
    if (this.document.findMapUsage(mapId)) return false;
    const before = { mapId: current.mapId };
    this.document.setCell(rx, ry, { mapId });
    this.history.push({ type: "replace", rx, ry, before, after: { mapId } });
    this.isDirty = true;
    return true;
  }

  _generateMapId() {
    let i = 1;
    while (this._mapCatalog.some((m) => m.id === `map_${i}`)) {
      i++;
    }
    return `map_${i}`;
  }

  // --- map catalog ---

  async _fetchMapCatalog() {
    try {
      const res = await fetch(`${EDITOR_SERVER_ORIGIN}/api/maps`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!this._isMounted) return;
      this._mapCatalog = Array.isArray(data) ? data : [];
      this.libraryPanel.setMaps(this._getLibraryMaps());
      this._syncLibraryUsed();
    } catch {
      if (!this._isMounted) return;
      this._mapCatalog = [];
      this.libraryPanel.setMaps([]);
      this._setStatus("Failed to load maps");
    }
  }

  // --- undo / redo ---

  _undo() {
    const entry = this.history.undo();
    if (!entry) return;
    this._applyHistoryCellState(entry.rx, entry.ry, entry.before);
    this.isDirty = true;
    this._renderAll();
    this._syncHistoryButtons();
    this._setStatus("Undo");
  }

  _redo() {
    const entry = this.history.redo();
    if (!entry) return;
    this._applyHistoryCellState(entry.rx, entry.ry, entry.after);
    this.isDirty = true;
    this._renderAll();
    this._syncHistoryButtons();
    this._setStatus("Redo");
  }

  _applyHistoryCellState(rx, ry, cellState) {
    if (cellState) {
      this.document.setCell(rx, ry, { mapId: cellState.mapId });
    } else {
      this.document.removeCell(rx, ry);
    }
  }

  _syncHistoryButtons() {
    if (this._undoBtn) this._undoBtn.disabled = !this.history.canUndo();
    if (this._redoBtn) this._redoBtn.disabled = !this.history.canRedo();
  }

  // --- shortcut helpers ---

  _centerView() {
    this.gridView?.centerOnContent();
    this._setStatus("View centered");
  }

  _setActiveTool(tool) {
    this.state.activeTool = tool;
    const labels = { place: "Place", replace: "Replace", erase: "Erase" };
    this._setStatus(`Tool: ${labels[tool]}`);
  }

  _toggleGrid() {
    this.state.showGrid = !this.state.showGrid;
    this._renderAll();
    this._setStatus(this.state.showGrid ? "Grid ON" : "Grid OFF");
  }

  // --- render helpers (only after mutations) ---

  _renderAll() {
    this.gridView.render();
    this.inspectorPanel.renderWorldInfo(this.document);
    this.inspectorPanel.renderMapInfo(this._getMapMeta(this.state.selectedMapId));
    this.inspectorPanel.renderCellInfo({
      selectedCell: this.state.selectedCell,
      hoverCell: this.state.hoverCell,
      document: this.document,
      selectedMapId: this.state.selectedMapId,
      isSelectedMapCompatible: this.state.selectedMapId ? this._isMapCompatible(this.state.selectedMapId) : false,
    });
    this._syncLibraryUsed();
  }

  _syncLibraryUsed() {
    const used = new Set();
    for (const entry of this.document.getCellEntries()) {
      used.add(entry.cell.mapId);
    }
    this.libraryPanel.setUsedMapIds(used);
  }

  // --- status ---

  _setStatus(message) {
    this.statusMessage = message;
    this._statusVersion++;
    const version = this._statusVersion;

    if (this._statusTimeout) {
      clearTimeout(this._statusTimeout);
    }

    this._statusTimeout = setTimeout(() => {
      if (this._statusVersion === version) {
        this.statusMessage = "";
        this._renderStatus();
      }
    }, 2000);

    this._renderStatus();
  }

  _renderStatus() {
    if (!this._statusEl) return;
    this._statusEl.textContent = this.statusMessage;
    this._statusEl.classList.toggle("is-visible", this.statusMessage !== "");
  }
}
