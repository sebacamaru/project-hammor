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
import { BucketTool } from "./tools/BucketTool.js";

import { WorkspaceModesPanel } from "../../shell/WorkspaceModesPanel.js";
import { LayerVisibilityPanel } from "../../shared/ui/LayerVisibilityPanel.js";
import { StatusBarPanel } from "./panels/StatusBarPanel.js";
import { TilesPanel } from "./panels/TilesPanel.js";
import { EventsPanel } from "./panels/EventsPanel.js";
import { LightingPanel } from "./panels/LightingPanel.js";

import { SceneEditor } from "./scenes/SceneEditor.js";
import { MapEditorViewport } from "./MapEditorViewport.js";
import { MapDocument } from "./document/MapDocument.js";
import { MapSerializer } from "./document/MapSerializer.js";
import { History } from "./history/History.js";
import { RuntimeMapBridge } from "./runtime/RuntimeMapBridge.js";
import { TilesetRegistry } from "../../../shared/data/loaders/TilesetRegistry.js";
import {
  DEFAULT_MAP_HEIGHT,
  DEFAULT_MAP_LAYERS,
  DEFAULT_MAP_WIDTH,
  EDITOR_SERVER_ORIGIN,
} from "./MapEditorConfig.js";
import { SearchListModal } from "../../shared/ui/SearchListModal.js";
import { ModalDialog } from "../../shared/ui/ModalDialog.js";
import { TilesetGroupsView } from "./panels/TilesetGroupsView.js";

import "./styles/map-editor.css";

export class MapEditorApp {
  constructor() {
    this.host = null;
    this.currentMapId = "test_map";
    this.document = null;
    this.runtimeMap = null;
    this.history = new History();
    this.history.onChange = () => this._toolbarRefresh?.();
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
    this.toolManager.register(
      "bucket",
      new BucketTool(this.state, () => this.document, () => this.history),
    );

    // Mode tabs in shell topbar
    if (editor?.modesEl) {
      this.modesPanel = new WorkspaceModesPanel(editor.modesEl, this.state, [
        { id: "terrain", label: "Terrain" },
        { id: "collisions", label: "Collisions" },
        { id: "events", label: "Events" },
        { id: "lights", label: "Lights" },
      ]);
    }

    // Panels
    this.tilesPanel = new TilesPanel(this.layout.leftPanelEl, this.state, {
      onTilesetEditor: () => this.openTilesetEditorDialog(),
    });
    this.layerVisPanel = new LayerVisibilityPanel({
      getState: () => this.state.get(),
      onToggleLayer: (id, v) => this.state.update((s) => { s.visibleLayers[id] = v; }),
      onSelectLayer: (id) => this.state.update((s) => { s.activeLayer = id; }),
      onToggleGrid: (v) => this.state.update((s) => { s.showGrid = v; }),
      subscribe: (cb) => this.state.subscribe(cb),
    });
    this.layerVisPanel.mount(this.layout.layersPanelEl);
    this.status = new StatusBarPanel(this.layout.statusBarEl, this.state);
    this.eventsPanel = new EventsPanel(
      this.layout.eventsPanelEl,
      this.state,
      () => this.document,
    );
    this.lightingPanel = new LightingPanel(
      this.layout.lightsPanelEl,
      this.state,
      () => this.document,
    );

    // Mode-based panel visibility
    this._terrainEls = [this.layout.leftPanelEl];
    this._eventsEls = [this.layout.eventsPanelEl];
    this._lightsEls = [this.layout.lightsPanelEl];
    this.state.subscribe((s) => {
      const terrain = s.mode === "terrain";
      const collisions = s.mode === "collisions";
      const events = s.mode === "events";
      const lights = s.mode === "lights";
      for (const el of this._terrainEls)
        el.style.display = terrain ? "" : "none";
      for (const el of this._eventsEls) el.style.display = events ? "" : "none";
      for (const el of this._lightsEls) el.style.display = lights ? "" : "none";
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
        onLightDragPreview: (lightId, x, y) => {
          this.scenes.current?.setLightDragPreview?.(lightId, x, y);
        },
        onLightDragClear: () => {
          this.scenes.current?.clearLightDragPreview?.();
        },
      },
    );

    // Forward selection state to overlays; reset entity selection on mode change
    this.state.subscribe((s) => {
      this.scenes.current?.setSelectedEntityId?.(s.selectedEntityId);
      this.scenes.current?.setSelectedLightId?.(s.selectedLightId);

      if (s.mode !== "events") {
        if (s.selectedEntityId != null || s.entityPlaceMode) {
          queueMicrotask(() =>
            this.state.patch({
              selectedEntityId: null,
              entityPlaceMode: false,
            }),
          );
        }
      }
    });

    window.addEventListener("keydown", this.onKeyDown);

    const initialMapId = this.editor?.initialMapId || this.currentMapId;
    await this.loadMap(initialMapId);

    // Escena del editor
    await this.scenes.goto(new SceneEditor(this.state, () => this.document));
    this.scenes.current?.setEntities?.(this.document?.entities);
    this.scenes.current?.setLights?.(this.document?.lighting?.lights ?? []);

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
    this.layerVisPanel?.destroy();
    this.eventsPanel?.destroy();
    this.lightingPanel?.destroy();
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
      if (
        tag !== "input" &&
        tag !== "textarea" &&
        tag !== "select" &&
        !isEditable
      ) {
        const { selectedEntityId } = this.state.get();
        if (selectedEntityId && this.document) {
          const removed = this.document.removeEntity(selectedEntityId);
          if (removed) this.state.patch({ selectedEntityId: null });
        }
      }
    }

    // Delete light shortcut (lights mode only)
    if (this.state.get().mode === "lights" && this.input.pressed("Delete")) {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isEditable = document.activeElement?.isContentEditable;
      if (
        tag !== "input" &&
        tag !== "textarea" &&
        tag !== "select" &&
        !isEditable
      ) {
        const { selectedLightId } = this.state.get();
        if (selectedLightId && this.document) {
          const removed = this.document.removeLight(selectedLightId);
          if (removed) this.state.patch({ selectedLightId: null });
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

  /** @returns {boolean} Whether there is an action to undo. */
  canUndo() {
    return this.history.undoStack.length > 0;
  }

  /** @returns {boolean} Whether there is an action to redo. */
  canRedo() {
    return this.history.redoStack.length > 0;
  }

  /**
   * Undoes the last action. Single source of truth — called by keyboard shortcut and toolbar button.
   */
  undo() {
    this.history.undo();
    this.state.emit();
  }

  /**
   * Redoes the last undone action. Single source of truth — called by keyboard shortcut and toolbar button.
   */
  redo() {
    this.history.redo();
    this.state.emit();
  }

  /**
   * Subscribes to toolbar-relevant state changes. Delegates to state subscriptions since
   * mode and activeTool changes are always emitted through state.
   * @param {Function} listener
   * @returns {Function} Unsubscribe function
   */
  subscribeToolbar(listener) {
    this._toolbarRefresh = listener;
    let prevMode = this.state.get().mode;
    let prevTool = this.state.get().activeTool;
    let prevEntityPlaceMode = this.state.get().entityPlaceMode;
    let prevSelectedEntityId = this.state.get().selectedEntityId;
    return this.state.subscribe((s) => {
      if (
        s.mode !== prevMode ||
        s.activeTool !== prevTool ||
        s.entityPlaceMode !== prevEntityPlaceMode ||
        s.selectedEntityId !== prevSelectedEntityId
      ) {
        prevMode = s.mode;
        prevTool = s.activeTool;
        prevEntityPlaceMode = s.entityPlaceMode;
        prevSelectedEntityId = s.selectedEntityId;
        listener();
      }
    });
  }

  /**
   * Returns the current contextual toolbar actions for the active mode.
   * @returns {Array<{id: string, label: string, active?: boolean, onClick: Function}>}
   */
  getToolbarActions() {
    const { mode, activeTool } = this.state.get();

    const common = [
      {
        id: "new-map",
        label: "New Map",
        onClick: () => this.openNewMapDialog(),
      },
      {
        id: "load-map",
        label: "Load Map",
        onClick: () => this.openLoadMapDialog(),
      },
      { type: "separator" },
    ];

    let modeActions = [];

    if (mode === "terrain") {
      modeActions = [
        {
          id: "pencil",
          label: "Pencil",
          active: activeTool === "pencil",
          onClick: () => this.state.patch({ activeTool: "pencil" }),
        },
        {
          id: "eraser",
          label: "Erase",
          active: activeTool === "eraser",
          onClick: () => this.state.patch({ activeTool: "eraser" }),
        },
        {
          id: "eyedropper",
          label: "Eyedropper",
          active: activeTool === "eyedropper",
          onClick: () => this.state.patch({ activeTool: "eyedropper" }),
        },
        {
          id: "bucket",
          label: "Bucket",
          active: activeTool === "bucket",
          onClick: () => this.state.patch({ activeTool: "bucket" }),
        },
      ];
    } else if (mode === "collisions") {
      modeActions = [
        {
          id: "pencil",
          label: "Pencil",
          icon: "pencil",
          active: activeTool === "pencil",
          onClick: () => this.state.patch({ activeTool: "pencil" }),
        },
        {
          id: "eraser",
          label: "Erase",
          icon: "eraser",
          active: activeTool === "eraser",
          onClick: () => this.state.patch({ activeTool: "eraser" }),
        },
      ];
    } else if (mode === "events") {
      const { entityPlaceMode, selectedEntityId } = this.state.get();
      modeActions = [
        {
          id: "add-entity",
          label: "Add Entity",
          active: entityPlaceMode,
          onClick: () => this.state.patch({ entityPlaceMode: !this.state.get().entityPlaceMode }),
        },
        {
          id: "delete-entity",
          label: "Delete Entity",
          disabled: !selectedEntityId,
          onClick: () => {
            const { selectedEntityId: id } = this.state.get();
            if (!id || !this.document) return;
            const removed = this.document.removeEntity(id);
            if (removed) this.state.patch({ selectedEntityId: null });
          },
        },
      ];
    }

    return [...common, ...modeActions];
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
    this.state.patch({ selectedEntityId: null, selectedLightId: null });
    await this.rebuildFullMap();

    this.state.update((s) => {
      if (!doc.getLayer(s.activeLayer)) {
        s.activeLayer = doc.layers[0]?.id ?? s.activeLayer;
      }
    });

    this.syncDirtyState();
    this.setOperationStatus("idle", "Map loaded", { autoReset: true });
  }

  /**
   * Opens the Load Map picker dialog.
   * Checks for unsaved changes first, then fetches the map list from the editor-server.
   */
  async openLoadMapDialog() {
    // Dirty guard — ask before discarding unsaved work
    if (this.document?.isDirty) {
      const discard = await this.editor?.confirm?.({
        title: "Unsaved changes",
        message: "You have unsaved changes. Discard them and load another map?",
        confirmLabel: "Discard",
        danger: true,
      });
      if (!discard) return;
    }

    // Fetch map list
    let maps;
    try {
      const response = await fetch(`${EDITOR_SERVER_ORIGIN}/api/maps`);
      if (!response.ok) throw new Error(`${response.status}`);
      maps = await response.json();
    } catch (error) {
      console.error("Failed to fetch map list", error);
      this.setOperationStatus("error", "Failed to load map list", { autoReset: true });
      return;
    }

    // Transform into picker items
    const items = maps.map((m) => {
      const hasSize = typeof m.width === "number" && typeof m.height === "number";
      return {
        id: m.id,
        title: m.name || m.id,
        subtitle: `ID: ${m.id}`,
        meta: hasSize ? `${m.width}\u00d7${m.height}` : "",
      };
    });

    // Open picker
    let modal;
    modal = new SearchListModal({
      title: "Load Map",
      placeholder: "Search maps\u2026",
      items,
      confirmText: "Load",
      cancelText: "Cancel",
      selectedId: this.currentMapId,
      onConfirm: (item) => {
        this.loadMap(item.id).catch((err) => {
          console.error("Failed to load map", err);
        });
      },
      onClose: () => {
        modal.destroy();
      },
    });
    modal.open();
  }

  /**
   * Opens the New Map dialog.
   * Prompts for name, width, and height; slugifies the name into an id;
   * checks for id collisions; then creates, loads, and immediately saves the new map.
   */
  async openNewMapDialog() {
    if (this.document?.isDirty) {
      const discard = await this.editor?.confirm?.({
        title: "Unsaved changes",
        message: "You have unsaved changes. Discard them and create a new map?",
        confirmLabel: "Discard",
        danger: true,
      });
      if (!discard) return;
    }

    // ── Build form DOM ──
    const formEl = document.createElement("div");
    formEl.className = "new-map-form";

    const nameRow = document.createElement("div");
    nameRow.className = "new-map-form__row";
    const nameLabel = document.createElement("label");
    nameLabel.className = "new-map-form__label";
    nameLabel.textContent = "Name";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "e.g. Northern Forest";
    nameInput.autocomplete = "off";
    nameRow.appendChild(nameLabel);
    nameRow.appendChild(nameInput);

    const dimsRow = document.createElement("div");
    dimsRow.className = "new-map-form__row";
    const dimsLabel = document.createElement("label");
    dimsLabel.className = "new-map-form__label";
    dimsLabel.textContent = "Size (tiles)";
    const dimsInputs = document.createElement("div");
    dimsInputs.className = "new-map-form__dims";
    const widthInput = document.createElement("input");
    widthInput.type = "number";
    widthInput.min = "1";
    widthInput.value = String(DEFAULT_MAP_WIDTH);
    widthInput.placeholder = "Width";
    const dimsSep = document.createElement("span");
    dimsSep.className = "new-map-form__dims-sep";
    dimsSep.textContent = "\u00d7";
    const heightInput = document.createElement("input");
    heightInput.type = "number";
    heightInput.min = "1";
    heightInput.value = String(DEFAULT_MAP_HEIGHT);
    heightInput.placeholder = "Height";
    dimsInputs.appendChild(widthInput);
    dimsInputs.appendChild(dimsSep);
    dimsInputs.appendChild(heightInput);
    dimsRow.appendChild(dimsLabel);
    dimsRow.appendChild(dimsInputs);

    const errorEl = document.createElement("p");
    errorEl.className = "new-map-form__error";

    formEl.appendChild(nameRow);
    formEl.appendChild(dimsRow);
    formEl.appendChild(errorEl);

    // ── Build footer DOM ──
    // display: contents makes the buttons direct children of .modal-footer's flex context
    const footerEl = document.createElement("div");
    footerEl.style.display = "contents";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "editor-btn editor-btn--ghost";
    cancelBtn.textContent = "Cancel";
    const createBtn = document.createElement("button");
    createBtn.className = "editor-btn editor-btn--primary";
    createBtn.textContent = "Create";
    footerEl.appendChild(cancelBtn);
    footerEl.appendChild(createBtn);

    let modal;

    const showError = (msg) => {
      errorEl.textContent = msg;
    };

    const handleCreate = async () => {
      showError("");
      const displayName = nameInput.value.trim();
      const width  = parseInt(widthInput.value, 10);
      const height = parseInt(heightInput.value, 10);

      if (!displayName) {
        showError("Name is required.");
        nameInput.focus();
        return;
      }

      const mapId = this._slugifyMapId(displayName);
      if (!mapId) {
        showError("Name must contain at least one letter or number.");
        nameInput.focus();
        return;
      }

      if (!Number.isFinite(width) || width < 1) {
        showError("Width must be a positive integer.");
        widthInput.focus();
        return;
      }
      if (!Number.isFinite(height) || height < 1) {
        showError("Height must be a positive integer.");
        heightInput.focus();
        return;
      }

      createBtn.disabled = true;
      createBtn.textContent = "Creating\u2026";

      try {
        const res = await fetch(`${EDITOR_SERVER_ORIGIN}/api/maps`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const maps = await res.json();
        if (maps.some((m) => m.id === mapId)) {
          showError(`A map with ID "${mapId}" already exists.`);
          nameInput.focus();
          createBtn.disabled = false;
          createBtn.textContent = "Create";
          return;
        }
      } catch (err) {
        showError("Could not reach editor-server. Is it running?");
        createBtn.disabled = false;
        createBtn.textContent = "Create";
        return;
      }

      try {
        const doc = this._createEmptyDoc(mapId, displayName, width, height);
        this.currentMapId = mapId;
        this.history.clear();
        this.setDocument(doc);
        this.state.patch({ selectedEntityId: null, selectedLightId: null });
        await this.rebuildFullMap({ resetCamera: true });
        await this.saveMap();
        this.setOperationStatus("idle", `Map "${displayName}" created`, { autoReset: true });
        modal.close();
      } catch (err) {
        console.error("Failed to create map", err);
        showError(`Error: ${err?.message ?? err}`);
        createBtn.disabled = false;
        createBtn.textContent = "Create";
      }
    };

    cancelBtn.addEventListener("click", () => modal.requestClose());
    createBtn.addEventListener("click", handleCreate);
    formEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleCreate();
    });

    modal = new ModalDialog({
      title: "New Map",
      content: formEl,
      footer: footerEl,
      onClose: () => {},
    });
    modal.open();
    nameInput.focus();
  }

  /**
   * Slugifies a display name into a valid map id.
   * Lowercases, replaces spaces with underscores, strips non-alphanumeric/underscore chars.
   * @param {string} name
   * @returns {string}
   */
  _slugifyMapId(name) {
    return name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  }

  /**
   * Creates a new empty MapDocument with the standard layer stack.
   * @param {string} id
   * @param {string} name
   * @param {number} width
   * @param {number} height
   * @returns {MapDocument}
   */
  _createEmptyDoc(id, name, width, height) {
    const size = width * height;
    return new MapDocument(
      { version: 1, id, name, tileset: "world", width, height, tileSize: 16, chunkSize: 32 },
      DEFAULT_MAP_LAYERS.map((layerId) => ({
        id: layerId,
        kind: layerId,
        visible: true,
        data: new Uint16Array(size).fill(MapDocument.EMPTY_STORED_TILE_ID),
      })),
      [],
      undefined,
    );
  }

  /**
   * Opens the Tileset Groups dialog with editable groups and atlas tile selector.
   * Confirms before closing if there are unsaved changes.
   *
   * Pattern for future modal integrations:
   *  - Pass confirm: (opts) => this.editor.confirm(opts) to views that need destructive action guards
   *  - Pass onCancel: () => modal?.requestClose() for user-initiated cancel (triggers onBeforeClose guard)
   *  - Pass onSaveSuccess: () => modal?.close() for post-save close (bypasses onBeforeClose guard)
   *  - Pass onBeforeClose to ModalDialog to intercept user-initiated close (X, Escape, backdrop)
   */
  openTilesetEditorDialog() {
    const tileset = this._getCurrentTilesetDefinition();
    let modal;

    const view = new TilesetGroupsView(tileset, {
      onSave:        (groups) => this._saveTilesetGroups(groups),
      onCancel:      () => modal?.requestClose(),
      onSaveSuccess: () => modal?.close(),
      confirm:       this.editor?.confirm ? (opts) => this.editor.confirm(opts) : null,
    });

    modal = new ModalDialog({
      title: "Tileset Groups",
      content: view.el,
      footer: view.footerEl,
      className: "modal-wide",
      onBeforeClose: async () => {
        if (!view.isDirty) return true;
        if (!this.editor?.confirm) return false;
        return await this.editor.confirm({
          title: "Unsaved changes",
          message: "You have unsaved changes in the tileset groups. Discard them?",
          confirmLabel: "Discard",
          tone: "danger",
        });
      },
      onClose: () => { view.destroy(); },
    });

    modal.open();
  }

  /**
   * Saves tileset groups to the editor-server and refreshes in-memory state.
   * @param {object[]} groups
   */
  async _saveTilesetGroups(groups) {
    const tilesetId = this.runtimeMap?.tilesetId;
    if (!tilesetId) return;

    this.setOperationStatus("saving", "Saving tileset groups...");
    try {
      const res = await fetch(`${EDITOR_SERVER_ORIGIN}/api/tilesets/${tilesetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups: structuredClone(groups) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      TilesetRegistry.invalidate(tilesetId);
      const freshTileset = await TilesetRegistry.load(tilesetId);
      if (this.runtimeMap) {
        this.runtimeMap.tileset = freshTileset;
      }
      this.state.emit();
      this.setOperationStatus("saved", "Tileset groups saved", { autoReset: true });
    } catch (error) {
      console.error("Failed to save tileset groups", error);
      this.setOperationStatus("error", "Failed to save tileset groups", { autoReset: true });
    }
  }

  /**
   * Returns the full tileset definition for the currently loaded map.
   * @returns {object|null}
   */
  _getCurrentTilesetDefinition() {
    return this.runtimeMap?.tileset ?? null;
  }

  /**
   * Rebuilds the runtime map from the current document and pushes it to the scene.
   * @param {{ resetCamera?: boolean }} [options]
   */
  async rebuildFullMap({ resetCamera = false } = {}) {
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
      currentScene.setMap(runtimeMap, { resetCamera });
      currentScene.setEntities?.(this.document.entities);
      currentScene.setLights?.(this.document?.lighting?.lights ?? []);
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
      if (event.type === "lightingChanged") {
        this.syncDirtyState();
        this.scenes.current?.setLights?.(this.document.lighting.lights);
        const selId = this.state.get().selectedLightId;
        if (selId != null && !this.document.getLight(selId)) {
          this.state.patch({ selectedLightId: null });
        }
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
      this.redo();
      return;
    }

    if (e.code === "KeyZ") {
      e.preventDefault();
      this.undo();
      return;
    }

    if (e.code === "KeyY") {
      e.preventDefault();
      this.redo();
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
