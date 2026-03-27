import {
  EDITOR_MIN_ZOOM,
  EDITOR_MAX_ZOOM,
  EDITOR_ZOOM_WHEEL_THRESHOLD,
} from "./MapEditorConfig.js";
import { waitFrames } from "./utils/waitFrames.js";
import { snapWorldToFeet } from "../../../shared/core/TileMath.js";

export class MapEditorViewport {
  /**
   * @param {HTMLElement} container
   * @param {import('../../../shared/render/Renderer.js').Renderer} renderer
   * @param {import('./MapEditorState.js').MapEditorState} state
   * @param {import('./tools/ToolManager.js').ToolManager} toolManager
   * @param {() => import('./document/MapDocument.js').MapDocument|null} getDocument
   * @param {import('../../../shared/input/Input.js').Input} input
   * @param {{ onDragPreview?: (entityId: string, x: number, y: number) => void, onDragClear?: () => void }} [options]
   */
  constructor(container, renderer, state, toolManager, getDocument, input, options = {}) {
    this.container = container;
    this.renderer = renderer;
    this.state = state;
    this.toolManager = toolManager;
    this.getDocument = getDocument ?? null;
    this.input = input;
    this._options = options;

    this.isPointerDown = false;
    this._temporaryPanActive = false;
    this._temporaryEraserActive = false;
    this._wheelAccumulator = 0;

    /** @type {{ entityId: string, previewX: number, previewY: number }|null} */
    this._drag = null;

    /** @type {{ lightId: string, offsetX: number, offsetY: number, previewX: number, previewY: number }|null} */
    this._lightDrag = null;

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

    // Events mode: entity placement or selection (Space+left still pans as normal)
    const s = this.state.get();
    if (e.button === 0 && !this.input.held("Space") && s.mode === "events") {
      const ctx = this.buildPointerContext(e);
      this.updateHoverTile(ctx);
      const doc = this.getDocument?.();

      // Place mode: create entity at clicked tile
      if (s.entityPlaceMode && doc) {
        const id = this._generateEntityId(doc.entities);
        const tileSize = s.map?.tileSize ?? 16;
        const snapped = snapWorldToFeet(ctx.worldX, ctx.worldY, tileSize);
        const entity = {
          id,
          prefab: "entity",
          x: snapped.x,
          y: snapped.y,
          components: {
            collision: {
              solid: false,
              hitbox: { offsetX: -8, offsetY: -16, width: 16, height: 16 },
            },
          },
        };
        doc.addEntity(entity);
        this.state.patch({ selectedEntityId: id, entityPlaceMode: false });
        return;
      }

      // Selection or drag start
      const hitId = doc ? this._hitTestEntities(doc.entities, ctx.worldX, ctx.worldY) : null;
      if (hitId && hitId === s.selectedEntityId) {
        // Already selected — start drag
        const tileSize = s.map?.tileSize ?? 16;
        const { x, y } = snapWorldToFeet(ctx.worldX, ctx.worldY, tileSize);
        this._drag = { entityId: hitId, previewX: x, previewY: y };
        this._options.onDragPreview?.(hitId, x, y);
        this.renderer.canvas.style.cursor = "grabbing";
      } else {
        // Different entity or empty space — normal selection change
        this.state.patch({ selectedEntityId: hitId });
      }
      return;
    }

    // Lights mode: light selection, creation, or drag start
    if (e.button === 0 && !this.input.held("Space") && s.mode === "lights") {
      const ctx = this.buildPointerContext(e);
      this.updateHoverTile(ctx);
      const doc = this.getDocument?.();
      if (!doc) return;

      const lights = doc.lighting?.lights ?? [];
      const hitId = this._hitTestLights(lights, ctx.worldX, ctx.worldY);

      if (hitId && hitId === s.selectedLightId) {
        // Already selected — start drag with offset
        const light = doc.getLight(hitId);
        const px = Math.round(ctx.worldX);
        const py = Math.round(ctx.worldY);
        this._lightDrag = {
          lightId: hitId,
          offsetX: px - light.x,
          offsetY: py - light.y,
          previewX: light.x,
          previewY: light.y,
        };
        this._options.onLightDragPreview?.(hitId, light.x, light.y);
        this.renderer.canvas.style.cursor = "grabbing";
      } else if (hitId) {
        // Different light — select it
        this.state.patch({ selectedLightId: hitId });
      } else {
        // Empty space — create new light at cursor, select it, start drag
        const px = Math.round(ctx.worldX);
        const py = Math.round(ctx.worldY);
        const id = doc.createLight({ x: px, y: py });
        this.state.patch({ selectedLightId: id });
        this._lightDrag = {
          lightId: id,
          offsetX: 0,
          offsetY: 0,
          previewX: px,
          previewY: py,
        };
        this._options.onLightDragPreview?.(id, px, py);
        this.renderer.canvas.style.cursor = "grabbing";
      }
      return;
    }

    const ctx = this.buildPointerContext(e);
    this.updateHoverTile(ctx);

    this.toolManager.pointerDown(ctx);
  }

  /**
   * Returns the id of the topmost entity whose sprite rect contains (worldX, worldY),
   * or null if no entity was hit. Uses (ex-8, ey-16, 16×16) — mirrors EntityOverlay._drawEntity().
   * @param {Array<object>} entities
   * @param {number} worldX
   * @param {number} worldY
   * @returns {string|null}
   */
  _hitTestEntities(entities, worldX, worldY) {
    if (!Array.isArray(entities)) return null;

    for (let i = entities.length - 1; i >= 0; i--) {
      const entity = entities[i];
      const ex = entity.x;
      const ey = entity.y;
      if (ex == null || ey == null) continue;

      // Always use sprite rect — same calculation as EntityOverlay._drawEntity() spriteX/spriteY
      const rx = ex - 8;
      const ry = ey - 16;
      const rw = 16;
      const rh = 16;

      if (rw > 0 && rh > 0 &&
          worldX >= rx && worldX < rx + rw &&
          worldY >= ry && worldY < ry + rh) {
        return entity.id ?? null;
      }
    }

    return null;
  }

  /**
   * Returns the id of the topmost light whose center is within pick radius of (worldX, worldY).
   * Pick radius is clamped to [10, 24] so large lights are not giant click targets.
   * @param {Array<object>} lights
   * @param {number} worldX
   * @param {number} worldY
   * @returns {string|null}
   */
  _hitTestLights(lights, worldX, worldY) {
    if (!Array.isArray(lights)) return null;

    for (let i = lights.length - 1; i >= 0; i--) {
      const light = lights[i];
      if (light.x == null || light.y == null) continue;
      const pickRadius = Math.max(10, Math.min(light.radius ?? 96, 24));
      const dx = worldX - light.x;
      const dy = worldY - light.y;
      if (dx * dx + dy * dy <= pickRadius * pickRadius) {
        return light.id ?? null;
      }
    }

    return null;
  }

  /**
   * Generates a unique entity id like "entity_001", skipping ids that already exist.
   * @param {Array<object>} entities
   * @returns {string}
   */
  _generateEntityId(entities) {
    const existing = new Set((entities ?? []).map((e) => e.id));
    let n = 1;
    while (existing.has(`entity_${String(n).padStart(3, "0")}`)) n++;
    return `entity_${String(n).padStart(3, "0")}`;
  }

  /**
   * Cancels an in-progress drag without committing the position change.
   * Clears the overlay preview and resets drag state.
   */
  _cancelDrag() {
    if (!this._drag) return;
    this._options.onDragClear?.();
    this._drag = null;
    this.renderer.canvas.style.cursor = "";
  }

  /**
   * Cancels an in-progress light drag without committing the position change.
   */
  _cancelLightDrag() {
    if (!this._lightDrag) return;
    this._options.onLightDragClear?.();
    this._lightDrag = null;
    this.renderer.canvas.style.cursor = "";
  }

  onPointerMove(e) {
    const ctx = this.buildPointerContext(e);
    this.updateHoverTile(ctx);

    // Entity drag active — update preview position, skip tool manager
    if (this._drag) {
      const tileSize = this.state.get().map?.tileSize ?? 16;
      const { x, y } = snapWorldToFeet(ctx.worldX, ctx.worldY, tileSize);
      if (x !== this._drag.previewX || y !== this._drag.previewY) {
        this._drag.previewX = x;
        this._drag.previewY = y;
        this._options.onDragPreview?.(this._drag.entityId, x, y);
      }
      return;
    }

    // Light drag active — update preview position, skip tool manager
    if (this._lightDrag) {
      const px = Math.round(ctx.worldX) - this._lightDrag.offsetX;
      const py = Math.round(ctx.worldY) - this._lightDrag.offsetY;
      if (px !== this._lightDrag.previewX || py !== this._lightDrag.previewY) {
        this._lightDrag.previewX = px;
        this._lightDrag.previewY = py;
        this._options.onLightDragPreview?.(this._lightDrag.lightId, px, py);
      }
      return;
    }

    // Hover cursor feedback
    if (this.isEventInsideViewport(e)) {
      const s = this.state.get();
      if (s.mode === "events" && s.selectedEntityId) {
        const doc = this.getDocument?.();
        if (doc) {
          const hitId = this._hitTestEntities(doc.entities, ctx.worldX, ctx.worldY);
          this.renderer.canvas.style.cursor = hitId === s.selectedEntityId ? "grab" : "";
        }
      } else if (s.mode === "lights" && s.selectedLightId) {
        const doc = this.getDocument?.();
        if (doc) {
          const hitId = this._hitTestLights(doc.lighting?.lights ?? [], ctx.worldX, ctx.worldY);
          this.renderer.canvas.style.cursor = hitId === s.selectedLightId ? "grab" : "";
        }
      }
    }

    this.toolManager.pointerMove(ctx);
  }

  onPointerUp(e) {
    if (!this.isPointerDown) return;

    this.isPointerDown = false;

    // Commit entity drag if active
    if (this._drag) {
      const doc = this.getDocument?.();
      if (doc) {
        const entity = doc.entities.find((ent) => ent.id === this._drag.entityId);
        if (entity && (this._drag.previewX !== entity.x || this._drag.previewY !== entity.y)) {
          doc.updateEntity(this._drag.entityId, {
            x: this._drag.previewX,
            y: this._drag.previewY,
          });
        }
      }
      this._options.onDragClear?.();
      this._drag = null;
      this.renderer.canvas.style.cursor = "";
      return;
    }

    // Commit light drag if active
    if (this._lightDrag) {
      const doc = this.getDocument?.();
      if (doc) {
        const light = doc.getLight(this._lightDrag.lightId);
        if (light && (this._lightDrag.previewX !== light.x || this._lightDrag.previewY !== light.y)) {
          doc.updateLight(this._lightDrag.lightId, {
            x: this._lightDrag.previewX,
            y: this._lightDrag.previewY,
          });
        }
      }
      this._options.onLightDragClear?.();
      this._lightDrag = null;
      this.renderer.canvas.style.cursor = "";
      return;
    }

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
