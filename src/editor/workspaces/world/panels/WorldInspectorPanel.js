export class WorldInspectorPanel {
  constructor({ el }) {
    this.el = el;
    this._worldSection = null;
    this._cellSection = null;

    this._onAssignRequested = null;
    this._onRemoveRequested = null;
    this._onReplaceRequested = null;
    this._onCreateMapRequested = null;
    this._onOpenMapRequested = null;
    this._onNameChanged = null;
    this._onMapSizeChanged = null;

    this._build();
  }

  onAssignRequested(cb) {
    this._onAssignRequested = cb;
  }

  onRemoveRequested(cb) {
    this._onRemoveRequested = cb;
  }

  onReplaceRequested(cb) {
    this._onReplaceRequested = cb;
  }

  onCreateMapRequested(cb) {
    this._onCreateMapRequested = cb;
  }

  onOpenMapRequested(cb) {
    this._onOpenMapRequested = cb;
  }

  onNameChanged(cb) {
    this._onNameChanged = cb;
  }

  onMapSizeChanged(cb) {
    this._onMapSizeChanged = cb;
  }

  renderWorldInfo(worldDoc) {
    const bounds = worldDoc.getBounds();
    const boundsText = bounds
      ? `X[${bounds.minRx}..${bounds.maxRx}] Y[${bounds.minRy}..${bounds.maxRy}]`
      : "—";

    const mapSize = worldDoc.getMapSize();
    const cellCount = worldDoc.getCellCount();
    const sizeLocked = cellCount > 0;
    const disabledAttr = sizeLocked ? "disabled" : "";

    this._worldSection.innerHTML = `
      <div class="inspector-section-title">World Properties</div>
      <div class="info-row"><span class="info-label">ID</span><span class="info-value">${worldDoc.id}</span></div>
      <div class="info-row"><span class="info-label">Name</span></div>
      <input type="text" class="inspector-input" data-field="name" value="${worldDoc.getName().replace(/"/g, '&quot;')}">
      <div class="info-row" style="margin-top:6px"><span class="info-label">Map Width</span></div>
      <input type="number" class="inspector-input" data-field="width" min="1" value="${mapSize.width}" ${disabledAttr}>
      <div class="info-row" style="margin-top:6px"><span class="info-label">Map Height</span></div>
      <input type="number" class="inspector-input" data-field="height" min="1" value="${mapSize.height}" ${disabledAttr}>
      ${sizeLocked ? '<div class="inspector-lock-msg">Map size is locked because this world contains maps.</div>' : ""}
      <div class="info-row" style="margin-top:6px"><span class="info-label">Cells</span><span class="info-value">${cellCount}</span></div>
      <div class="info-row"><span class="info-label">Bounds</span><span class="info-value">${boundsText}</span></div>
    `;

    // Name change listener
    const nameInput = this._worldSection.querySelector('[data-field="name"]');
    nameInput.addEventListener("change", () => {
      const trimmed = nameInput.value.trim();
      if (!trimmed || trimmed === worldDoc.getName()) {
        nameInput.value = worldDoc.getName();
        return;
      }
      this._onNameChanged?.(trimmed);
    });

    // Map size change listeners
    const widthInput = this._worldSection.querySelector('[data-field="width"]');
    const heightInput = this._worldSection.querySelector('[data-field="height"]');

    const handleSizeChange = () => {
      const w = parseInt(widthInput.value, 10);
      const h = parseInt(heightInput.value, 10);
      const currentSize = worldDoc.getMapSize();
      if (!Number.isFinite(w) || w <= 0) { widthInput.value = currentSize.width; return; }
      if (!Number.isFinite(h) || h <= 0) { heightInput.value = currentSize.height; return; }
      if (w === currentSize.width && h === currentSize.height) return;
      this._onMapSizeChanged?.({ width: w, height: h });
    };

    widthInput.addEventListener("change", handleSizeChange);
    heightInput.addEventListener("change", handleSizeChange);
  }

  renderCellInfo({ selectedCell, hoverCell, document, selectedMapId }) {
    if (selectedCell) {
      const cell = document.getCell(selectedCell.rx, selectedCell.ry);
      if (cell) {
        this._renderOccupiedCell(selectedCell, cell, document, selectedMapId);
      } else {
        this._renderEmptyCell(selectedCell, document, selectedMapId);
      }
    } else if (hoverCell) {
      const cell = document.getCell(hoverCell.rx, hoverCell.ry);
      const mapText = cell ? cell.mapId : "empty";
      this._cellSection.innerHTML = `
        <div class="inspector-section-title dim">Hover</div>
        <div class="info-row dim"><span class="info-label">Position</span><span class="info-value">${hoverCell.rx}, ${hoverCell.ry}</span></div>
        <div class="info-row dim"><span class="info-label">Map</span><span class="info-value">${mapText}</span></div>
      `;
    } else {
      this._cellSection.innerHTML = `
        <div class="inspector-section-title dim">No selection</div>
      `;
    }
  }

  destroy() {
    this.el.innerHTML = "";
    this._worldSection = null;
    this._cellSection = null;
  }

  // --- private ---

  _build() {
    this._worldSection = document.createElement("div");
    this._worldSection.className = "world-inspector-world";

    this._cellSection = document.createElement("div");
    this._cellSection.className = "world-inspector-cell";

    this.el.appendChild(this._worldSection);
    this.el.appendChild(this._cellSection);
  }

  _renderEmptyCell(selectedCell, doc, selectedMapId) {
    const { rx, ry } = selectedCell;
    const canAssign = selectedMapId && doc.canAssignMap(rx, ry, selectedMapId);
    const assignDisabled = canAssign ? "" : "disabled";
    const canCreate = doc.canPlaceAt(rx, ry);
    const createDisabled = canCreate ? "" : "disabled";

    this._cellSection.innerHTML = `
      <div class="inspector-section-title">Selected Cell</div>
      <div class="info-row"><span class="info-label">Position</span><span class="info-value">${rx}, ${ry}</span></div>
      <div class="info-row"><span class="info-label">Map</span><span class="info-value">empty</span></div>
      <div class="info-row"><span class="info-label">Selected Map</span><span class="info-value">${selectedMapId ?? "none"}</span></div>
      <button class="inspector-action" data-action="assign" ${assignDisabled}>Assign Selected Map</button>
      <button class="inspector-action" data-action="create" ${createDisabled}>Create Map Here</button>
    `;

    this._cellSection.querySelector('[data-action="assign"]')
      ?.addEventListener("click", () => this._onAssignRequested?.());
    this._cellSection.querySelector('[data-action="create"]')
      ?.addEventListener("click", () => this._onCreateMapRequested?.());
  }

  _renderOccupiedCell(selectedCell, cell, doc, selectedMapId) {
    const { rx, ry } = selectedCell;
    const canReplace = selectedMapId
      && selectedMapId !== cell.mapId
      && !doc.findMapUsage(selectedMapId);
    const replaceDisabled = canReplace ? "" : "disabled";

    this._cellSection.innerHTML = `
      <div class="inspector-section-title">Selected Cell</div>
      <div class="info-row"><span class="info-label">Position</span><span class="info-value">${rx}, ${ry}</span></div>
      <div class="info-row"><span class="info-label">Map</span><span class="info-value">${cell.mapId}</span></div>
      <button class="inspector-action" data-action="open">Open Map</button>
      <button class="inspector-action" data-action="remove">Remove from World</button>
      <button class="inspector-action" data-action="replace" ${replaceDisabled}>Replace with Selected Map</button>
    `;

    this._cellSection.querySelector('[data-action="open"]')
      ?.addEventListener("click", () => this._onOpenMapRequested?.());
    this._cellSection.querySelector('[data-action="remove"]')
      ?.addEventListener("click", () => this._onRemoveRequested?.());
    this._cellSection.querySelector('[data-action="replace"]')
      ?.addEventListener("click", () => this._onReplaceRequested?.());
  }
}
