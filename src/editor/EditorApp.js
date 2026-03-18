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

import { ToolbarPanel } from "./panels/ToolbarPanel.js";
import { LayersPanel } from "./panels/LayersPanel.js";
import { ToolsPanel } from "./panels/ToolsPanel.js";
import { StatusBarPanel } from "./panels/StatusBarPanel.js";

import { SceneEditor } from "./scenes/SceneEditor.js";
import { EditorViewport } from "./EditorViewport.js";

export class EditorApp {
  constructor(root) {
    this.root = root;
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
    this.toolManager.register("pencil", new PencilTool(this.state));
    this.toolManager.register("eraser", new EraseTool(this.state));

    // Panels
    this.toolbar = new ToolbarPanel(this.shell.toolbarEl, this.state);
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

    this.scenes.update(dt);
  }

  render(alpha) {
    this.scenes.render(alpha);
    this.debug.update(this.loop.lastFrameTime ?? 16);
  }
}
