import "./styles/world-editor.css";

import { WorldDocument } from "./WorldDocument.js";
import { WorldEditorState } from "./WorldEditorState.js";
import { WorldGridView } from "./WorldGridView.js";
import { WorldLibraryPanel } from "./panels/WorldLibraryPanel.js";
import { WorldInspectorPanel } from "./panels/WorldInspectorPanel.js";

export class WorldEditorApp {
  constructor() {
    this.host = null;
    this.root = null;
    this.document = null;
    this.state = null;
    this.isDirty = false;

    this.gridView = null;
    this.libraryPanel = null;
    this.inspectorPanel = null;
    this._gridResizeObserver = null;
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

    // Build layout skeleton
    this.root = document.createElement("div");
    this.root.className = "world-editor";
    this.root.innerHTML = `
      <aside class="world-panel world-panel-library">
        <div class="world-panel-header">Maps</div>
        <div class="world-panel-body" data-slot="library"></div>
      </aside>
      <main class="world-panel world-panel-grid">
        <div class="world-panel-header">World</div>
        <div class="world-panel-body" data-slot="grid"></div>
      </main>
      <aside class="world-panel world-panel-inspector">
        <div class="world-panel-header">Inspector</div>
        <div class="world-panel-body" data-slot="inspector"></div>
      </aside>
    `;
    this.host.appendChild(this.root);

    const gridSlot = this.root.querySelector('[data-slot="grid"]');
    const librarySlot = this.root.querySelector('[data-slot="library"]');
    const inspectorSlot = this.root.querySelector('[data-slot="inspector"]');

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
      }
    });

    this.inspectorPanel.onRemoveRequested(() => {
      const { selectedCell } = this.state;
      if (!selectedCell) return;
      if (this._removeCell(selectedCell.rx, selectedCell.ry)) {
        this._renderAll();
      }
    });

    this.inspectorPanel.onReplaceRequested(() => {
      const { selectedCell, selectedMapId } = this.state;
      if (!selectedCell || !selectedMapId) return;
      if (this._replaceCell(selectedCell.rx, selectedCell.ry, selectedMapId)) {
        this._renderAll();
      }
    });

    // Initial library used state
    this._syncLibraryUsed();
  }

  unmount() {
    this._gridResizeObserver?.disconnect();
    this._gridResizeObserver = null;

    this.gridView?.unmount();
    this.libraryPanel?.destroy();
    this.inspectorPanel?.destroy();

    this.gridView = null;
    this.libraryPanel = null;
    this.inspectorPanel = null;

    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
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
    this.document.setCell(rx, ry, { mapId });
    this.isDirty = true;
    return true;
  }

  _removeCell(rx, ry) {
    if (!this.document.hasCell(rx, ry)) return false;
    this.document.removeCell(rx, ry);
    this.isDirty = true;
    return true;
  }

  _replaceCell(rx, ry, mapId) {
    if (!this.document.hasCell(rx, ry)) return false;
    if (!mapId) return false;
    const current = this.document.getCell(rx, ry);
    if (current.mapId === mapId) return false;
    if (this.document.findMapUsage(mapId)) return false;
    this.document.setCell(rx, ry, { mapId });
    this.isDirty = true;
    return true;
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
}
