import { Renderer } from "../shared/render/Renderer.js";
import { SceneManager } from "../shared/scene/SceneManager.js";
import { GameLoop } from "../shared/core/GameLoop.js";
import { DebugOverlay } from "../shared/render/DebugOverlay.js";
import { AssetManager } from "../shared/assets/AssetsManager.js";
import { Input } from "../shared/input/Input.js";

import { EditorShell } from "./EditorShell.js";
import { EditorState } from "./EditorState.js";
import { ToolManager } from "./tools/ToolManager.js";
import { PanTool } from "./tools/PanTool.js";
import { PencilTool } from "./tools/PencilTool.js";
import { EraseTool } from "./tools/EraseTool.js";
import { EyedropperTool } from "./tools/EyedropperTool.js";

import { ToolbarPanel } from "./panels/ToolbarPanel.js";
import { LayersPanel } from "./panels/LayersPanel.js";
import { ToolsPanel } from "./panels/ToolsPanel.js";
import { StatusBarPanel } from "./panels/StatusBarPanel.js";
import { TilesPanel } from "./panels/TilesPanel.js";

import { SceneEditor } from "./scenes/SceneEditor.js";
import { EditorViewport } from "./EditorViewport.js";
import { MapSerializer } from "./document/MapSerializer.js";
import { RuntimeMapImporter } from "./document/RuntimeMapImporter.js";
import { History } from "./history/History.js";
import { RuntimeMapBridge } from "./runtime/RuntimeMapBridge.js";
import { TilesetRegistry } from "../shared/data/loaders/TilesetRegistry.js";

export class EditorApp {
  constructor(root) {
    this.root = root;
    this.currentMapId = "test_map";
    this.document = null;
    this.runtimeMap = null;
    this.history = new History();
    this._runtimeReloadVersion = 0;

    this.onKeyDown = this.onKeyDown.bind(this);
  }

  async start() {
    // Shell HTML del editor
    this.shell = new EditorShell(this.root);

    // Estado central
    this.state = new EditorState();

    // Renderer montado dentro del viewport del shell
    this.renderer = new Renderer(this.shell.viewportEl);
    await this.renderer.init();

    // Default editor scale = auto-computed scale for this screen
    const autoScale = this.renderer.viewport.scale;
    this.state.update((s) => { s.editorScale = autoScale; });
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
      new PencilTool(this.state, () => this.document, () => this.history),
    );
    this.toolManager.register(
      "eraser",
      new EraseTool(this.state, () => this.document, () => this.history),
    );
    this.toolManager.register(
      "eyedropper",
      new EyedropperTool(this.state, () => this.document),
    );

    // Panels
    this.toolbar = new ToolbarPanel(this.shell.toolbarEl, this.state);
    this.tilesPanel = new TilesPanel(this.shell.leftPanelEl, this.state);
    this.layers = new LayersPanel(this.shell.rightPanelEl, this.state);
    this.tools = new ToolsPanel(this.shell.toolsEl, this.state);
    this.status = new StatusBarPanel(this.shell.statusBarEl, this.state);

    // UI visibility toggle (via state subscription, not per-frame)
    this._shellEl = this.root.querySelector(".editor-shell");
    this.state.subscribe((s) => {
      this._shellEl.classList.toggle("ui-hidden", !s.uiVisible);
    });

    // Viewport
    this.viewport = new EditorViewport(
      this.shell.viewportEl,
      this.renderer,
      this.state,
      this.toolManager,
      this.input,
    );

    window.addEventListener("keydown", this.onKeyDown);

    await this.loadMap(this.currentMapId);

    // Escena del editor
    await this.scenes.goto(new SceneEditor(this.state, this.toolManager));

    // Loop
    this.loop = new GameLoop(this);
    this.loop.start();

    if (import.meta.env.DEV) {
      window.__editor = this;
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

    // Tool shortcuts
    if (this.input.pressed("KeyB")) {
      this.state.update((s) => { s.activeTool = "pencil"; });
    }
    if (this.input.pressed("KeyE")) {
      this.state.update((s) => { s.activeTool = "eraser"; });
    }
    if (this.input.pressed("KeyI")) {
      this.state.update((s) => { s.activeTool = "eyedropper"; });
    }

    // Grid toggle
    if (this.input.pressed("KeyG")) {
      this.state.update((s) => { s.showGrid = !s.showGrid; });
    }

    this.scenes.update(dt);
  }

  render(alpha) {
    this.scenes.render(alpha);
    this.debug.update(this.loop.lastFrameTime ?? 16);
  }

  handleDocumentTilesChanged(event) {
    if (!event || event.type !== "tilesChanged") return;

    this.syncDirtyState();
    this.rebuildFullMap();
  }

  async saveMap({ download = false } = {}) {
    if (!this.document) return null;

    if (!this.document.meta.id) {
      this.document.meta.id = this.currentMapId;
    }

    const serialized = MapSerializer.serialize(this.document);
    localStorage.setItem(
      this.getStorageKey(this.document.meta.id),
      JSON.stringify(serialized),
    );

    if (download) {
      this.downloadEditorMapJson(this.document.meta.id, serialized);
    }

    this.document.markClean();
    this.syncDirtyState();
    return serialized;
  }

  async loadMap(mapId) {
    const storedJson = localStorage.getItem(this.getStorageKey(mapId));
    const doc = storedJson
      ? MapSerializer.deserialize(JSON.parse(storedJson))
      : RuntimeMapImporter.fromRuntimeJson(await this.fetchMapJson(mapId));
    doc.meta.id ??= mapId;
    doc.markClean();

    this.currentMapId = mapId;
    this.history.clear();
    this.setDocument(doc);
    await this.rebuildFullMap();

    this.state.update((s) => {
      if (!doc.getLayer(s.activeLayer)) {
        s.activeLayer = doc.layers[0]?.id ?? s.activeLayer;
      }
    });

    this.syncDirtyState();
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
    });
  }

  async fetchMapJson(mapId) {
    const response = await fetch(`/content/maps/${mapId}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load map "${mapId}": ${response.status}`);
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

  downloadEditorMapJson(mapId, serialized) {
    const blob = new Blob([
      JSON.stringify(serialized, null, 2),
    ], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${mapId}.json`;
    link.click();

    URL.revokeObjectURL(url);
  }

  onKeyDown(e) {
    const target = e.target;
    if (target instanceof HTMLElement) {
      const isEditable = target.closest("input, textarea, select, [contenteditable='true']");
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

    if (e.code === "KeyS") {
      e.preventDefault();
      this.saveMap();
      return;
    }

    if (e.code === "KeyR") {
      e.preventDefault();
      this.reloadRuntimeMap();
    }
  }
}
