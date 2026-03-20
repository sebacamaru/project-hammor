import {
  EDITOR_MIN_ZOOM,
  EDITOR_MAX_ZOOM,
  EDITOR_ZOOM_WHEEL_THRESHOLD,
} from "./MapEditorConfig.js";
import { waitFrames } from "./utils/waitFrames.js";

export class MapEditorViewport {
  constructor(container, renderer, state, toolManager, input) {
    this.container = container;
    this.renderer = renderer;
    this.state = state;
    this.toolManager = toolManager;
    this.input = input;

    this.isPointerDown = false;
    this._temporaryPanActive = false;
    this._temporaryEraserActive = false;
    this._wheelAccumulator = 0;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onWheel = this.onWheel.bind(this);

    this.bindEvents();
  }

  bindEvents() {
    const canvas = this.renderer.canvas;

    canvas.addEventListener("mousedown", this.onPointerDown);
    window.addEventListener("mousemove", this.onPointerMove);
    window.addEventListener("mouseup", this.onPointerUp);
    canvas.addEventListener("contextmenu", this.onContextMenu);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKeyDown);
  }

  destroy() {
    const canvas = this.renderer.app.canvas;

    canvas.removeEventListener("mousedown", this.onPointerDown);
    window.removeEventListener("mousemove", this.onPointerMove);
    window.removeEventListener("mouseup", this.onPointerUp);
    canvas.removeEventListener("contextmenu", this.onContextMenu);
    canvas.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKeyDown);
  }

  onContextMenu(e) {
    e.preventDefault();
  }

  onKeyDown(e) {
    if (e.code === "Space" || e.code === "Tab") {
      e.preventDefault();
    }
  }

  async onWheel(e) {
    e.preventDefault();

    const s = this.state.get();
    if (!s.map) return;

    this._wheelAccumulator += e.deltaY;
    if (Math.abs(this._wheelAccumulator) < EDITOR_ZOOM_WHEEL_THRESHOLD) return;

    const step = this._wheelAccumulator > 0 ? -1 : 1;
    this._wheelAccumulator = 0;

    const oldScale = s.editorScale;
    const newScale = Math.max(
      EDITOR_MIN_ZOOM,
      Math.min(EDITOR_MAX_ZOOM, oldScale + step),
    );
    if (newScale === oldScale) return;

    // World point under cursor before scale change
    const rect = this.renderer.app.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldX = s.camera.x + screenX / oldScale;
    const worldY = s.camera.y + screenY / oldScale;

    // Apply new scale (triggers viewport recomputation + canvas CSS update)
    const canvas = this.renderer.canvas;
    canvas.style.visibility = "hidden";
    this.renderer.setScaleOverride(newScale);

    // Get new canvas rect (canvas may shift due to centering offset change)
    const newRect = this.renderer.app.canvas.getBoundingClientRect();
    const newScreenX = e.clientX - newRect.left;
    const newScreenY = e.clientY - newRect.top;

    // Adjust camera so the same world point stays under the cursor
    this.state.update((st) => {
      st.camera.x = worldX - newScreenX / newScale;
      st.camera.y = worldY - newScreenY / newScale;
      st.editorScale = newScale;
    });

    // Wait for browser to apply layout before showing canvas
    await waitFrames(4);
    canvas.style.visibility = "visible";
  }

  onPointerDown(e) {
    if (!this.isEventInsideViewport(e)) return;

    this.isPointerDown = true;

    // Temporary pan: middle mouse OR Space+left click
    if (e.button === 1 || (e.button === 0 && this.input.held("Space"))) {
      this.toolManager.setTemporaryTool("pan");
      this._temporaryPanActive = true;
      this.renderer.canvas.style.cursor = "move";
    }

    // Temporary eraser: right click
    if (e.button === 2) {
      this.toolManager.setTemporaryTool("eraser");
      this._temporaryEraserActive = true;
    }

    const ctx = this.buildPointerContext(e);
    this.updateHoverTile(ctx);

    this.toolManager.pointerDown(ctx);
  }

  onPointerMove(e) {
    const ctx = this.buildPointerContext(e);
    this.updateHoverTile(ctx);

    this.toolManager.pointerMove(ctx);
  }

  onPointerUp(e) {
    if (!this.isPointerDown) return;

    this.isPointerDown = false;

    const ctx = this.buildPointerContext(e);
    this.toolManager.pointerUp(ctx);

    // Clear temporary pan AFTER pointerUp so PanTool gets its pointerUp call
    if (this._temporaryPanActive) {
      this.toolManager.clearTemporaryTool();
      this._temporaryPanActive = false;
      this.renderer.canvas.style.cursor = "";
    }

    // Clear temporary eraser
    if (this._temporaryEraserActive) {
      this.toolManager.clearTemporaryTool();
      this._temporaryEraserActive = false;
    }
  }

  isEventInsideViewport(e) {
    const rect = this.renderer.canvas.getBoundingClientRect();

    return (
      e.clientX >= rect.left &&
      e.clientX < rect.right &&
      e.clientY >= rect.top &&
      e.clientY < rect.bottom
    );
  }

  buildPointerContext(e) {
    const rect = this.renderer.app.canvas.getBoundingClientRect();

    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const s = this.state.get();
    const { camera, map } = s;

    let worldX = 0;
    let worldY = 0;
    let tileX = null;
    let tileY = null;

    if (map) {
      const scale = this.renderer.viewport.scale;

      worldX = camera.x + screenX / scale;
      worldY = camera.y + screenY / scale;

      tileX = Math.floor(worldX / map.tileSize);
      tileY = Math.floor(worldY / map.tileSize);

      if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) {
        tileX = null;
        tileY = null;
      }
    }

    return {
      originalEvent: e,
      button: e.button,
      buttons: e.buttons,

      screenX,
      screenY,

      worldX,
      worldY,

      tileX,
      tileY,

      viewportScale: this.renderer.viewport.scale,
    };
  }

  updateHoverTile(ctx) {
    this.state.update((s) => {
      if (ctx.tileX == null || ctx.tileY == null) {
        s.hoverTile = null;
        return;
      }

      if (
        s.hoverTile &&
        s.hoverTile.x === ctx.tileX &&
        s.hoverTile.y === ctx.tileY
      ) {
        return;
      }

      s.hoverTile = {
        x: ctx.tileX,
        y: ctx.tileY,
      };
    });
  }
}
