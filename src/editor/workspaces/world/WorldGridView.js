import { makeWorldKey } from "./utils/worldKey.js";
import { getOrthogonalNeighbors } from "./utils/worldAdjacency.js";

const BASE_CELL_SIZE = 64;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_FACTOR = 1.1;

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

    // Pan state
    this._isPanning = false;
    this._panStartX = 0;
    this._panStartY = 0;
    this._panStartPanX = 0;
    this._panStartPanY = 0;

    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onPointerCancel = this._handlePointerUp.bind(this);
    this._onPointerLeave = this._handlePointerLeave.bind(this);
    this._onWheel = this._handleWheel.bind(this);

    this.canvas.addEventListener("pointermove", this._onPointerMove);
    this.canvas.addEventListener("pointerdown", this._onPointerDown);
    this.canvas.addEventListener("pointerup", this._onPointerUp);
    this.canvas.addEventListener("pointercancel", this._onPointerCancel);
    this.canvas.addEventListener("pointerleave", this._onPointerLeave);
    this.canvas.addEventListener("wheel", this._onWheel, { passive: false });
  }

  setDocument(doc) {
    this.document = doc;
  }

  mount(host) {
    this.host = host;
    host.appendChild(this.canvas);
    this.resize();
  }

  unmount() {
    this.canvas.removeEventListener("pointermove", this._onPointerMove);
    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    this.canvas.removeEventListener("pointerup", this._onPointerUp);
    this.canvas.removeEventListener("pointercancel", this._onPointerCancel);
    this.canvas.removeEventListener("pointerleave", this._onPointerLeave);
    this.canvas.removeEventListener("wheel", this._onWheel);
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
    const s = BASE_CELL_SIZE * this.state.zoom;
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const rx = Math.round((canvasX - cx - this.state.panX) / s);
    const ry = Math.round((canvasY - cy - this.state.panY) / s);
    return { rx, ry };
  }

  centerOnContent() {
    const bounds = this.document.getBounds();
    if (!bounds) {
      this.state.panX = 0;
      this.state.panY = 0;
      this.state.zoom = 1;
      this.render();
      return;
    }
    const midRx = (bounds.minRx + bounds.maxRx) / 2;
    const midRy = (bounds.minRy + bounds.maxRy) / 2;
    const s = BASE_CELL_SIZE * this.state.zoom;
    this.state.panX = Math.round(-midRx * s);
    this.state.panY = Math.round(-midRy * s);
    this.render();
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    ctx.clearRect(0, 0, w, h);

    const s = BASE_CELL_SIZE * this.state.zoom;
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
      const { x, y } = this._cellToScreen(n.rx, n.ry);

      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("+", x + s / 2, y + s / 2);
    }

    // Draw occupied cells
    for (const entry of entries) {
      const { x, y } = this._cellToScreen(entry.rx, entry.ry);

      // Fill
      ctx.fillStyle = "rgba(80, 130, 200, 0.5)";
      ctx.fillRect(x, y, s, s);

      // Border
      ctx.strokeStyle = "rgba(80, 130, 200, 0.8)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);

      // Map ID text
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = entry.cell.mapId.length > 8
        ? entry.cell.mapId.slice(0, 7) + "…"
        : entry.cell.mapId;
      ctx.fillText(label, x + s / 2, y + s / 2 - 6);

      // Coordinates text
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "10px sans-serif";
      ctx.fillText(`${entry.rx},${entry.ry}`, x + s / 2, y + s / 2 + 8);
    }

    // Ghost preview for valid placement
    const { selectedMapId } = this.state;
    if (hoverCell && selectedMapId
        && this.document.canAssignMap(hoverCell.rx, hoverCell.ry, selectedMapId)) {
      const { x, y } = this._cellToScreen(hoverCell.rx, hoverCell.ry);
      ctx.fillStyle = "rgba(80, 200, 130, 0.25)";
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "italic 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const ghostLabel = selectedMapId.length > 8
        ? selectedMapId.slice(0, 7) + "…"
        : selectedMapId;
      ctx.fillText(ghostLabel, x + s / 2, y + s / 2);
    }

    // Hover highlight
    if (hoverCell) {
      const { x, y } = this._cellToScreen(hoverCell.rx, hoverCell.ry);
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.fillRect(x, y, s, s);
    }

    // Selection highlight
    if (selectedCell) {
      const { x, y } = this._cellToScreen(selectedCell.rx, selectedCell.ry);
      ctx.strokeStyle = "#4fc3f7";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
    }

    // Origin crosshair
    const originX = w / 2 + this.state.panX;
    const originY = h / 2 + this.state.panY;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(originX - 8, originY);
    ctx.lineTo(originX + 8, originY);
    ctx.moveTo(originX, originY - 8);
    ctx.lineTo(originX, originY + 8);
    ctx.stroke();
  }

  // --- private ---

  _cellToScreen(rx, ry) {
    const s = BASE_CELL_SIZE * this.state.zoom;
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    return {
      x: cx + this.state.panX + rx * s - s / 2,
      y: cy + this.state.panY + ry * s - s / 2,
    };
  }

  _handlePointerMove(e) {
    if (this._isPanning) {
      this.state.panX = Math.round(this._panStartPanX + (e.clientX - this._panStartX));
      this.state.panY = Math.round(this._panStartPanY + (e.clientY - this._panStartY));
      this.render();
      return;
    }
    const cell = this.screenToCell(e.offsetX, e.offsetY);
    const key = makeWorldKey(cell.rx, cell.ry);
    if (key !== this._lastHoverKey) {
      this._lastHoverKey = key;
      this._onHover?.(cell);
    }
  }

  _handlePointerDown(e) {
    if (e.button === 1) {
      e.preventDefault();
      this._isPanning = true;
      this._panStartX = e.clientX;
      this._panStartY = e.clientY;
      this._panStartPanX = this.state.panX;
      this._panStartPanY = this.state.panY;
      this.canvas.setPointerCapture(e.pointerId);
      this.canvas.classList.add("is-panning");
      return;
    }
    if (e.button === 0 && !this._isPanning) {
      const cell = this.screenToCell(e.offsetX, e.offsetY);
      this._onSelect?.(cell);
    }
  }

  _handlePointerUp(e) {
    if (!this._isPanning) return;
    if (e.type === "pointercancel" || e.button === 1) {
      this._isPanning = false;
      if (this.canvas.hasPointerCapture?.(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
      this.canvas.classList.remove("is-panning");
    }
  }

  _handlePointerLeave() {
    this._lastHoverKey = null;
    this._onHover?.(null);
  }

  _handleWheel(e) {
    e.preventDefault();
    const oldZoom = this.state.zoom;
    const newZoom = e.deltaY < 0
      ? Math.min(oldZoom * ZOOM_FACTOR, MAX_ZOOM)
      : Math.max(oldZoom / ZOOM_FACTOR, MIN_ZOOM);
    if (newZoom === oldZoom) return;

    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const mouseX = e.offsetX;
    const mouseY = e.offsetY;

    // World point under cursor before zoom
    const wx = (mouseX - cx - this.state.panX) / (BASE_CELL_SIZE * oldZoom);
    const wy = (mouseY - cy - this.state.panY) / (BASE_CELL_SIZE * oldZoom);

    this.state.zoom = newZoom;

    // Adjust pan so same world point stays under cursor
    this.state.panX = Math.round(mouseX - cx - wx * BASE_CELL_SIZE * newZoom);
    this.state.panY = Math.round(mouseY - cy - wy * BASE_CELL_SIZE * newZoom);

    this.render();
  }
}
