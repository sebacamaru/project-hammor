export class WorldInspectorPanel {
  constructor({ el }) {
    this.el = el;
    this._worldSection = null;
    this._cellSection = null;

    this._onAssignRequested = null;
    this._onRemoveRequested = null;
    this._onReplaceRequested = null;

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

  renderWorldInfo(worldDoc) {
    const bounds = worldDoc.getBounds();
    const boundsText = bounds
      ? `X[${bounds.minRx}..${bounds.maxRx}] Y[${bounds.minRy}..${bounds.maxRy}]`
      : "—";

    this._worldSection.innerHTML = `
      <div class="inspector-section-title">World</div>
      <div class="info-row"><span class="info-label">ID</span><span class="info-value">${worldDoc.id}</span></div>
      <div class="info-row"><span class="info-label">Name</span><span class="info-value">${worldDoc.name}</span></div>
      <div class="info-row"><span class="info-label">Cells</span><span class="info-value">${worldDoc.getCellCount()}</span></div>
      <div class="info-row"><span class="info-label">Bounds</span><span class="info-value">${boundsText}</span></div>
    `;
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

    this._cellSection.innerHTML = `
      <div class="inspector-section-title">Selected Cell</div>
      <div class="info-row"><span class="info-label">Position</span><span class="info-value">${rx}, ${ry}</span></div>
      <div class="info-row"><span class="info-label">Map</span><span class="info-value">empty</span></div>
      <div class="info-row"><span class="info-label">Selected Map</span><span class="info-value">${selectedMapId ?? "none"}</span></div>
      <button class="inspector-action" data-action="assign" ${assignDisabled}>Assign Selected Map</button>
    `;

    this._cellSection.querySelector('[data-action="assign"]')
      ?.addEventListener("click", () => this._onAssignRequested?.());
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
      <button class="inspector-action" data-action="remove">Remove from World</button>
      <button class="inspector-action" data-action="replace" ${replaceDisabled}>Replace with Selected Map</button>
    `;

    this._cellSection.querySelector('[data-action="remove"]')
      ?.addEventListener("click", () => this._onRemoveRequested?.());
    this._cellSection.querySelector('[data-action="replace"]')
      ?.addEventListener("click", () => this._onReplaceRequested?.());
  }
}
