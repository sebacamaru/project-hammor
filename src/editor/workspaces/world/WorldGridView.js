import { makeWorldKey } from "./utils/worldKey.js";
import { getOrthogonalNeighbors } from "./utils/worldAdjacency.js";

const CELL_SIZE = 64;

export class WorldGridView {
  constructor({ document, state }) {
    this.document = document;
    this.state = state;
    this.host = null;

    this.canvas = window.document.createElement("canvas");
    this.canvas.className = "world-grid-canvas";
    this.ctx = this.canvas.getContext("2d");

    this._onHover = null;
    this._onSelect = null;
    this._lastHoverKey = null;

    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerLeave = this._handlePointerLeave.bind(this);

    this.canvas.addEventListener("pointermove", this._onPointerMove);
    this.canvas.addEventListener("pointerdown", this._onPointerDown);
    this.canvas.addEventListener("pointerleave", this._onPointerLeave);
  }

  mount(host) {
    this.host = host;
    host.appendChild(this.canvas);
    this.resize();
  }

  unmount() {
    this.canvas.removeEventListener("pointermove", this._onPointerMove);
    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    this.canvas.removeEventListener("pointerleave", this._onPointerLeave);
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.host = null;
  }

  resize() {
    if (!this.host) return;
    this.canvas.width = this.host.clientWidth;
    this.canvas.height = this.host.clientHeight;
    this.render();
  }

  onHover(cb) {
    this._onHover = cb;
  }

  onSelect(cb) {
    this._onSelect = cb;
  }

  screenToCell(canvasX, canvasY) {
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const rx = Math.round((canvasX - centerX) / CELL_SIZE);
    const ry = Math.round((canvasY - centerY) / CELL_SIZE);
    return { rx, ry };
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    ctx.clearRect(0, 0, w, h);

    const centerX = w / 2;
    const centerY = h / 2;
    const entries = this.document.getCellEntries();
    const { selectedCell, hoverCell } = this.state;

    // Build set of occupied keys
    const occupiedKeys = new Set();
    for (const entry of entries) {
      occupiedKeys.add(entry.key);
    }

    // Compute empty neighbor cells
    const emptyNeighbors = new Map();
    for (const entry of entries) {
      const neighbors = getOrthogonalNeighbors(entry.rx, entry.ry);
      for (const n of neighbors) {
        const key = makeWorldKey(n.rx, n.ry);
        if (!occupiedKeys.has(key) && !emptyNeighbors.has(key)) {
          emptyNeighbors.set(key, n);
        }
      }
    }

    // Draw empty neighbors
    for (const [, n] of emptyNeighbors) {
      const x = centerX + n.rx * CELL_SIZE - CELL_SIZE / 2;
      const y = centerY + n.ry * CELL_SIZE - CELL_SIZE / 2;

      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("+", x + CELL_SIZE / 2, y + CELL_SIZE / 2);
    }

    // Draw occupied cells
    for (const entry of entries) {
      const x = centerX + entry.rx * CELL_SIZE - CELL_SIZE / 2;
      const y = centerY + entry.ry * CELL_SIZE - CELL_SIZE / 2;

      // Fill
      ctx.fillStyle = "rgba(80, 130, 200, 0.5)";
      ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

      // Border
      ctx.strokeStyle = "rgba(80, 130, 200, 0.8)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);

      // Map ID text
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = entry.cell.mapId.length > 8
        ? entry.cell.mapId.slice(0, 7) + "…"
        : entry.cell.mapId;
      ctx.fillText(label, x + CELL_SIZE / 2, y + CELL_SIZE / 2 - 6);

      // Coordinates text
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "10px sans-serif";
      ctx.fillText(`${entry.rx},${entry.ry}`, x + CELL_SIZE / 2, y + CELL_SIZE / 2 + 8);
    }

    // Ghost preview for valid placement
    const { selectedMapId } = this.state;
    if (hoverCell && selectedMapId
        && this.document.canAssignMap(hoverCell.rx, hoverCell.ry, selectedMapId)) {
      const x = centerX + hoverCell.rx * CELL_SIZE - CELL_SIZE / 2;
      const y = centerY + hoverCell.ry * CELL_SIZE - CELL_SIZE / 2;
      ctx.fillStyle = "rgba(80, 200, 130, 0.25)";
      ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "italic 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = selectedMapId.length > 8
        ? selectedMapId.slice(0, 7) + "…"
        : selectedMapId;
      ctx.fillText(label, x + CELL_SIZE / 2, y + CELL_SIZE / 2);
    }

    // Hover highlight
    if (hoverCell) {
      const x = centerX + hoverCell.rx * CELL_SIZE - CELL_SIZE / 2;
      const y = centerY + hoverCell.ry * CELL_SIZE - CELL_SIZE / 2;
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
    }

    // Selection highlight
    if (selectedCell) {
      const x = centerX + selectedCell.rx * CELL_SIZE - CELL_SIZE / 2;
      const y = centerY + selectedCell.ry * CELL_SIZE - CELL_SIZE / 2;
      ctx.strokeStyle = "#4fc3f7";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    }

    // Origin crosshair
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX - 8, centerY);
    ctx.lineTo(centerX + 8, centerY);
    ctx.moveTo(centerX, centerY - 8);
    ctx.lineTo(centerX, centerY + 8);
    ctx.stroke();
  }

  // --- private ---

  _handlePointerMove(e) {
    const cell = this.screenToCell(e.offsetX, e.offsetY);
    const key = makeWorldKey(cell.rx, cell.ry);
    if (key !== this._lastHoverKey) {
      this._lastHoverKey = key;
      this._onHover?.(cell);
    }
  }

  _handlePointerDown(e) {
    if (e.button !== 0) return;
    const cell = this.screenToCell(e.offsetX, e.offsetY);
    this._onSelect?.(cell);
  }

  _handlePointerLeave() {
    this._lastHoverKey = null;
    this._onHover?.(null);
  }
}
