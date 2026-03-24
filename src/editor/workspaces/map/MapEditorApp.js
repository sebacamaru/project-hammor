import { Renderer } from "../../../shared/render/Renderer.js";
import { SceneManager } from "../../../shared/scene/SceneManager.js";
import { GameLoop } from "../../../shared/core/GameLoop.js";
import { DebugOverlay } from "../../../shared/render/DebugOverlay.js";
import { AssetManager } from "../../../shared/assets/AssetsManager.js";
import { Input } from "../../../shared/input/Input.js";

import { MapEditorLayout } from "./MapEditorLayout.js";
import { MapEditorState } from "./MapEditorState.js";
import { ToolManager } from "./tools/ToolManager.js";
import { PanTool } from "./tools/PanTool.js";
import { PencilTool } from "./tools/PencilTool.js";
import { EraseTool } from "./tools/EraseTool.js";
import { EyedropperTool } from "./tools/EyedropperTool.js";

import { WorkspaceModesPanel } from "../../shell/WorkspaceModesPanel.js";
import { LayersPanel } from "./panels/LayersPanel.js";
import { ToolsPanel } from "./panels/ToolsPanel.js";
import { StatusBarPanel } from "./panels/StatusBarPanel.js";
import { TilesPanel } from "./panels/TilesPanel.js";
import { EventsPanel } from "./panels/EventsPanel.js";

import { SceneEditor } from "./scenes/SceneEditor.js";
import { MapEditorViewport } from "./MapEditorViewport.js";
import { MapSerializer } from "./document/MapSerializer.js";
import { History } from "./history/History.js";
import { RuntimeMapBridge } from "./runtime/RuntimeMapBridge.js";
import { TilesetRegistry } from "../../../shared/data/loaders/TilesetRegistry.js";
import { EDITOR_SERVER_ORIGIN } from "./MapEditorConfig.js";

import "./styles/map-editor.css";

export class MapEditorApp {
  constructor() {
    this.host = null;
    this.currentMapId = "test_map";
    this.document = null;
    this.runtimeMap = null;
    this.history = new History();
    this._runtimeReloadVersion = 0;
    this._statusResetTimeoutId = null;
    this._statusToken = 0;

    this.onKeyDown = this.onKeyDown.bind(this);
  }

  async mount(host, editor) {
    this.host = host;
    this.editor = editor || null;

    // Shell HTML del editor
    this.layout = new MapEditorLayout(this.host);

    // Estado central
    this.state = new MapEditorState();

    // Renderer montado dentro del viewport del shell
    this.renderer = new Renderer(this.layout.viewportEl);
    await this.renderer.init();

    // Default editor scale = auto-computed scale for this screen
    const autoScale = this.renderer.viewport.scale;
    this.state.update((s) => {
      s.editorScale = autoScale;
    });
    this.renderer.setScaleOverride(autoScale);

    // Assets compartidos
    await AssetManager.init();
    await AssetManager.loadBundle("core");

    // Input global
    this.input = new Input();

    // Scene runtime
    this.scenes = new SceneManager(this);

    // Debug
    this.debug = new DebugOverlay(this.renderer.stage);

    // Tools
    this.toolManager = new ToolManager(this.state);
    this.toolManager.register("pan", new PanTool(this.state));
    this.toolManager.register(
      "pencil",
      new PencilTool(
        this.state,
        () => this.document,
        () => this.history,
      ),
    );
    this.toolManager.register(
      "eraser",
      new EraseTool(
        this.state,
        () => this.document,
        () => this.history,
      ),
    );
    this.toolManager.register(
      "eyedropper",
      new EyedropperTool(this.state, () => this.document),
    );

    // Mode tabs in shell topbar
    if (editor?.modesEl) {
      this.modesPanel = new WorkspaceModesPanel(editor.modesEl, this.state, [
        { id: "terrain",    label: "Terrain"    },
        { id: "collisions", label: "Collisions" },
        { id: "events",     label: "Events"     },
        { id: "lights",     label: "Lights"     },
      ]);
    }

    // Panels
    this.tilesPanel = new TilesPanel(this.layout.leftPanelEl, this.state);
    this.layers = new LayersPanel(this.layout.rightPanelEl, this.state);
    this.tools = new ToolsPanel(this.layout.toolsEl, this.state);
    this.status = new StatusBarPanel(this.layout.statusBarEl, this.state);
    this.eventsPanel = new EventsPanel(this.layout.eventsPanelEl, this.state, () => this.document);

    // Mode-based panel visibility
    this._terrainEls = [
      this.layout.leftPanelEl,
      this.layout.rightPanelEl,
      this.layout.toolsEl,
    ];
    this._collisionEls = [
      this.layout.toolsEl,
    ];
    this._eventsEls = [
      this.layout.eventsPanelEl,
    ];
    this.state.subscribe((s) => {
      const terrain = s.mode === "terrain";
      const collisions = s.mode === "collisions";
      const events = s.mode === "events";
      for (const el of this._terrainEls) el.style.display = terrain ? "" : "none";
      for (const el of this._collisionEls) el.style.display = collisions ? "" : "none";
      for (const el of this._eventsEls) el.style.display = events ? "" : "none";
    });

    // UI visibility toggle (via state subscription, not per-frame)
    this._shellEl = this.host.querySelector(".editor-shell");
    this.state.subscribe((s) => {
      this._shellEl.classList.toggle("ui-hidden", !s.uiVisible);
    });

    // Viewport
    this.viewport = new MapEditorViewport(
      this.layout.viewportEl,
      this.renderer,
      this.state,
      this.toolManager,
      () => this.document,
      this.input,
      {
        onDragPreview: (entityId, x, y) => {
          this.scenes.current?.setEntityDragPreview?.(entityId, x, y);
        },
        onDragClear: () => {
          this.scenes.current?.clearEntityDragPreview?.();
        },
      },
    );

    // Forward entity selection state to the overlay; reset on mode change
    this.state.subscribe((s) => {
      this.scenes.current?.setSelectedEntityId?.(s.selectedEntityId);

      if (s.mode !== "events") {
        if (s.selectedEntityId != null || s.entityPlaceMode) {
          queueMicrotask(() => this.state.patch({ selectedEntityId: null, entityPlaceMode: false }));
        }
      }
    });

    window.addEventListener("keydown", this.onKeyDown);

    const initialMapId = this.editor?.initialMapId || this.currentMapId;
    await this.loadMap(initialMapId);

    // Escena del editor
    await this.scenes.goto(new SceneEditor(this.state, this.toolManager));
    this.scenes.current?.setEntities?.(this.document?.entities);

    // Loop
    this.loop = new GameLoop(this);
    this.loop.start();

    if (import.meta.env.DEV) {
      window.__editor = this;
    }
  }

  unmount() {
    this.loop?.stop();
    this.modesPanel?.destroy();
    this.eventsPanel?.destroy();
    window.removeEventListener("keydown", this.onKeyDown);
    this.viewport?.destroy();
    this.scenes?.current?.destroy();
    this.documentUnsubscribe?.();
    this.clearStatusResetTimeout();
    this.input?.destroy?.();
    this.renderer?.destroy?.();

    if (this.host) {
      this.host.innerHTML = "";
      this.host = null;
    }
  }

  update(dt) {
    this.input.poll();

    if (this.input.pressed("Escape")) {
      this.debug.toggle();
    }

    if (this.input.pressed("Tab")) {
      this.state.update((s) => {
        s.uiVisible = !s.uiVisible;
      });
    }

    // Tool shortcuts (terrain + collision modes)
    const mode = this.state.get().mode;
    if (mode === "terrain" || mode === "collisions") {
      if (this.input.pressed("KeyB")) {
        this.state.update((s) => {
          s.activeTool = "pencil";
        });
      }
      if (this.input.pressed("KeyE")) {
        this.state.update((s) => {
          s.activeTool = "eraser";
        });
      }
      if (mode === "terrain" && this.input.pressed("KeyI")) {
        this.state.update((s) => {
          s.activeTool = "eyedropper";
        });
      }
    }

    // Delete entity shortcut (events mode only)
    if (this.state.get().mode === "events" && this.input.pressed("Delete")) {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isEditable = document.activeElement?.isContentEditable;
      if (tag !== "input" && tag !== "textarea" && tag !== "select" && !isEditable) {
        const { selectedEntityId } = this.state.get();
        if (selectedEntityId && this.document) {
          const removed = this.document.removeEntity(selectedEntityId);
          if (removed) this.state.patch({ selectedEntityId: null });
        }
      }
    }

    // Grid toggle
    if (this.input.pressed("KeyG")) {
      this.state.update((s) => {
        s.showGrid = !s.showGrid;
      });
    }

    this.scenes.update(dt);
  }

  render(alpha) {
    this.scenes.render(alpha);
    this.debug.update(this.loop.lastFrameTime ?? 16);
  }

  resize(width, height) {
    // Renderer handles resize internally via ResizeObserver
  }

  async save() {
    return this.saveMap();
  }

  canSave() {
    return !!this.document;
  }

  getTitle() {
    return "Map Editor";
  }

  handleDocumentTilesChanged(event) {
    if (!event || event.type !== "tilesChanged") return;

    this.syncDirtyState();

    if (!this.runtimeMap) return;

    const changedChunks = RuntimeMapBridge.applyTilesChangedEvent(
      this.runtimeMap,
      event,
    );

    if (changedChunks.size === 0) return;

    const currentScene = this.scenes.current;
    if (currentScene?.rebuildChunk) {
      for (const key of changedChunks) {
        const [cx, cy] = key.split(",").map(Number);
        currentScene.rebuildChunk(cx, cy);
      }
    }
  }

  async saveMap({ download = false } = {}) {
    if (!this.document) return null;

    if (!this.document.meta.id) {
      this.document.meta.id = this.currentMapId;
    }

    const serialized = MapSerializer.serialize(this.document);
    const mapId = this.document.meta.id;
    this.setOperationStatus("saving", "Saving map...");

    try {
      await this.putMapDocument(mapId, serialized);
      localStorage.setItem(
        this.getStorageKey(mapId),
        JSON.stringify(serialized),
      );

      if (download) {
        this.downloadEditorMapJson(mapId, serialized);
      }

      this.document.markClean();
      this.syncDirtyState();
      this.setOperationStatus("saved", "Map saved", { autoReset: true });
      return serialized;
    } catch (error) {
      console.error(`Failed to save map "${mapId}" to editor-server`, error);
      this.setOperationStatus("error", "Save failed");

      try {
        localStorage.setItem(
          this.getStorageKey(mapId),
          JSON.stringify(serialized),
        );
        console.warn(
          `Stored local recovery copy for map "${mapId}" after save failure`,
        );
      } catch (storageError) {
        console.error(
          `Failed to store local recovery copy for map "${mapId}"`,
          storageError,
        );
      }

      throw error;
    }
  }

  async loadMap(mapId) {
    let doc;
    this.setOperationStatus("loading", "Loading map...");

    try {
      const mapJson = await this.fetchMapDocument(mapId);
      doc = MapSerializer.deserialize(mapJson);
    } catch (error) {
      console.error(`Failed to load map "${mapId}" from editor-server`, error);

      const storedJson = localStorage.getItem(this.getStorageKey(mapId));
      if (!storedJson) {
        this.setOperationStatus("error", "Failed to load map");
        throw error;
      }

      console.warn(`Using local recovery copy for map "${mapId}"`);
      try {
        doc = MapSerializer.deserialize(JSON.parse(storedJson));
      } catch (storageError) {
        this.setOperationStatus("error", "Failed to load map");
        throw new Error(
          `Failed to load map "${mapId}" from editor-server and local recovery is invalid: ${storageError.message}`,
        );
      }
    }

    doc.meta.id ??= mapId;
    doc.markClean();

    this.currentMapId = mapId;
    this.history.clear();
    this.setDocument(doc);
    this.state.patch({ selectedEntityId: null });
    await this.rebuildFullMap();

    this.state.update((s) => {
      if (!doc.getLayer(s.activeLayer)) {
        s.activeLayer = doc.layers[0]?.id ?? s.activeLayer;
      }
    });

    this.syncDirtyState();
    this.setOperationStatus("idle", "Map loaded", { autoReset: true });
  }

  async rebuildFullMap() {
    if (!this.document) return;

    const reloadVersion = ++this._runtimeReloadVersion;
    const runtimeMap = RuntimeMapBridge.toGameMapData(this.document);
    runtimeMap.tilesetId = this.resolveTilesetId(this.document);
    runtimeMap.tileset = await TilesetRegistry.load(runtimeMap.tilesetId);
    if (reloadVersion !== this._runtimeReloadVersion) {
      return;
    }

    this.runtimeMap = runtimeMap;

    const currentScene = this.scenes.current;
    if (currentScene?.setMap) {
      currentScene.setMap(runtimeMap);
      currentScene.setEntities?.(this.document.entities);
      return;
    }

    this.state.update((s) => {
      s.map = runtimeMap;
      s.dirtyChunks.clear();
    });
  }

  async reloadRuntimeMap() {
    return this.rebuildFullMap();
  }

  setDocument(doc) {
    this.documentUnsubscribe?.();
    this.document = doc;
    this.syncDirtyState();
    this.documentUnsubscribe = this.document.subscribe((event) => {
      if (event.type === "tilesChanged") {
        this.handleDocumentTilesChanged(event);
      }
      if (event.type === "entitiesChanged") {
        this.syncDirtyState();
        this.scenes.current?.setEntities?.(this.document.entities);
      }
    });
  }

  async fetchMapDocument(mapId) {
    let response;

    try {
      response = await fetch(`${EDITOR_SERVER_ORIGIN}/api/maps/${mapId}`);
    } catch (error) {
      throw new Error(
        `Failed to reach editor-server at ${EDITOR_SERVER_ORIGIN}: ${error.message}`,
      );
    }

    if (!response.ok) {
      let details = "";
      try {
        const payload = await response.json();
        details = payload?.error ? ` ${payload.error}` : "";
      } catch {
        // ignore JSON parse errors here and surface the status code below
      }
      throw new Error(
        `Failed to load map "${mapId}": ${response.status}${details}`,
      );
    }

    return response.json();
  }

  async putMapDocument(mapId, payload) {
    let response;

    try {
      response = await fetch(`${EDITOR_SERVER_ORIGIN}/api/maps/${mapId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw new Error(
        `Failed to reach editor-server at ${EDITOR_SERVER_ORIGIN}: ${error.message}`,
      );
    }

    if (!response.ok) {
      let details = "";
      try {
        const body = await response.json();
        details = body?.error ? ` ${body.error}` : "";
      } catch {
        // ignore JSON parse errors here and surface the status code below
      }
      throw new Error(
        `Failed to save map "${mapId}": ${response.status}${details}`,
      );
    }

    return response.json();
  }

  getStorageKey(mapId) {
    return `editor.mapDocument.${mapId}`;
  }

  resolveTilesetId(doc) {
    return doc?.meta?.tileset ?? "world";
  }

  syncDirtyState() {
    this.state.patch({
      dirty: this.document?.isDirty ?? false,
    });
  }

  setOperationStatus(saveStatus, statusMessage, { autoReset = false } = {}) {
    this.clearStatusResetTimeout();

    const statusToken = ++this._statusToken;
    this.state.patch({
      saveStatus,
      statusMessage,
    });

    if (autoReset) {
      this.scheduleStatusReset(statusToken);
    }
  }

  scheduleStatusReset(statusToken, delayMs = 1800) {
    this._statusResetTimeoutId = window.setTimeout(() => {
      if (statusToken !== this._statusToken) {
        return;
      }

      this._statusResetTimeoutId = null;
      this.state.patch({
        saveStatus: "idle",
        statusMessage: "",
      });
    }, delayMs);
  }

  clearStatusResetTimeout() {
    if (this._statusResetTimeoutId == null) {
      return;
    }

    window.clearTimeout(this._statusResetTimeoutId);
    this._statusResetTimeoutId = null;
  }

  downloadEditorMapJson(mapId, serialized) {
    const blob = new Blob([JSON.stringify(serialized, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${mapId}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  onKeyDown(e) {
    const target = e.target;
    if (target instanceof HTMLElement) {
      const isEditable = target.closest(
        "input, textarea, select, [contenteditable='true']",
      );
      if (isEditable) return;
    }

    if (!e.ctrlKey) return;

    if (e.code === "KeyZ" && e.shiftKey) {
      e.preventDefault();
      this.history.redo();
      return;
    }

    if (e.code === "KeyZ") {
      e.preventDefault();
      this.history.undo();
      return;
    }

    if (e.code === "KeyY") {
      e.preventDefault();
      this.history.redo();
      return;
    }

    if (e.code === "KeyR") {
      e.preventDefault();
      void this.reloadRuntimeMap().catch((error) => {
        console.error("Runtime reload failed", error);
      });
    }
  }
}
