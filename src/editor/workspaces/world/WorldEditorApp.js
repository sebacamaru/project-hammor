import "./styles/world-editor.css";

import { WorldDocument } from "./WorldDocument.js";
import { WorldEditorState } from "./WorldEditorState.js";
import { WorldHistory } from "./WorldHistory.js";
import { WorldGridView } from "./WorldGridView.js";
import { WorldLibraryPanel } from "./panels/WorldLibraryPanel.js";
import { WorldInspectorPanel } from "./panels/WorldInspectorPanel.js";

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

    this.statusMessage = "";
    this._statusVersion = 0;
    this._statusTimeout = null;
    this._statusEl = null;
  }

  async mount(host) {
    this.host = host;

    this.document = new WorldDocument({
      id: "main_world",
      name: "Main World",
      version: 1,
      cells: {
        "0,0": { mapId: "town" },
        "1,0": { mapId: "forest_west" },
      },
    });

    this.state = new WorldEditorState();
    this.history = new WorldHistory();

    // Build layout skeleton
    this.root = document.createElement("div");
    this.root.className = "world-editor";
    this.root.innerHTML = `
      <aside class="world-panel world-panel-library">
        <div class="world-panel-header">Maps</div>
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

    this.gridView.onHover((cell) => {
      this.state.hoverCell = cell;
      this.inspectorPanel.renderCellInfo({
        selectedCell: this.state.selectedCell,
        hoverCell: cell,
        document: this.document,
        selectedMapId: this.state.selectedMapId,
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
        });
      }
    });

    this._gridResizeObserver = new ResizeObserver(() => {
      this.gridView.resize();
    });
    this._gridResizeObserver.observe(gridSlot);

    // Library panel
    this.libraryPanel = new WorldLibraryPanel({ el: librarySlot });
    this.libraryPanel.setMaps(["town", "forest", "dungeon"]);

    this.libraryPanel.onMapSelected((mapId) => {
      this.state.selectedMapId = mapId;
      this.libraryPanel.setSelectedMapId(mapId);
      this.inspectorPanel.renderCellInfo({
        selectedCell: this.state.selectedCell,
        hoverCell: this.state.hoverCell,
        document: this.document,
        selectedMapId: mapId,
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
    });

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
      this.libraryPanel.addMap(newMapId);
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

  // --- document mutations ---

  _assignMapToCell(rx, ry, mapId) {
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
    while (this.libraryPanel.hasMap(`map_${i}`)) {
      i++;
    }
    return `map_${i}`;
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
    this.inspectorPanel.renderCellInfo({
      selectedCell: this.state.selectedCell,
      hoverCell: this.state.hoverCell,
      document: this.document,
      selectedMapId: this.state.selectedMapId,
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
