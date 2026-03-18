import { EDITOR_MIN_ZOOM, EDITOR_MAX_ZOOM } from "./EditorConfig.js";

export class EditorViewport {
  constructor(container, renderer, state, toolManager, input) {
    this.container = container;
    this.renderer = renderer;
    this.state = state;
    this.toolManager = toolManager;
    this.input = input;

    this.isPointerDown = false;
    this._temporaryPanActive = false;

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

  onWheel(e) {
    e.preventDefault();

    const s = this.state.get();
    if (!s.map) return;

    const rect = this.renderer.app.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const oldZoom = s.camera.zoom;
    const step = e.deltaY < 0 ? 1 : -1;
    const newZoom = Math.max(EDITOR_MIN_ZOOM, Math.min(EDITOR_MAX_ZOOM, oldZoom + step));
    if (newZoom === oldZoom) return;

    // World point under cursor before zoom
    const worldX = s.camera.x + screenX / oldZoom;
    const worldY = s.camera.y + screenY / oldZoom;

    // Adjust camera so the same world point stays under the cursor
    this.state.update((st) => {
      st.camera.x = worldX - screenX / newZoom;
      st.camera.y = worldY - screenY / newZoom;
      st.camera.zoom = newZoom;
    });
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
      const zoom = camera.zoom || 1;

      worldX = camera.x + screenX / zoom;
      worldY = camera.y + screenY / zoom;

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
