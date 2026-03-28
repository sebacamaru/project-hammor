import "./styles/dialogs.css";

import { ShellState } from "./ShellState.js";
import { WorkspaceRegistry } from "./WorkspaceRegistry.js";
import { DialogHost } from "./DialogHost.js";
import { EditorSubToolbar } from "../shared/ui/EditorSubToolbar.js";

export class EditorShell {
  constructor(root) {
    this.root = root;
    this.state = new ShellState();
    this.registry = new WorkspaceRegistry();
    this.activeWorkspace = null;
    this.tabs = new Map();
    this._pendingMapId = null;

    this.root.innerHTML = `
      <div class="shell-topbar">
        <div class="shell-tabs"></div>
        <div class="shell-modes"></div>
      </div>
      <div class="shell-subtoolbar"></div>
      <div class="shell-workspace-host"></div>
      <div class="editor-dialog-layer"></div>
    `;

    this.tabsEl = this.root.querySelector(".shell-tabs");
    this.modesEl = this.root.querySelector(".shell-modes");
    this.workspaceHost = this.root.querySelector(".shell-workspace-host");

    this.subToolbar = new EditorSubToolbar(this.root.querySelector(".shell-subtoolbar"));
    this._toolbarUnsub = null;

    this.dialogHost = new DialogHost();
    this.dialogHost.mount(this.root.querySelector(".editor-dialog-layer"));

    this.onKeyDown = this.onKeyDown.bind(this);
    window.addEventListener("keydown", this.onKeyDown);
  }

  registerWorkspace(id, label, factory) {
    this.registry.register(id, factory);

    const btn = document.createElement("button");
    btn.className = "shell-tab";
    btn.textContent = label;
    btn.dataset.workspaceId = id;
    btn.addEventListener("click", () => this.switchTo(id));
    this.tabsEl.appendChild(btn);
    this.tabs.set(id, btn);

    this.state.patch({
      workspaceIds: [...this.state.get().workspaceIds, id],
    });
  }

  async switchTo(id) {
    if (this.state.get().activeWorkspaceId === id) return;

    // Unsub previous workspace toolbar subscription
    this._toolbarUnsub?.();
    this._toolbarUnsub = null;

    // Unmount current workspace
    if (this.activeWorkspace) {
      this.activeWorkspace.unmount();
      this.activeWorkspace = null;
    }

    // Clear host and modes slot
    this.workspaceHost.innerHTML = "";
    this.modesEl.innerHTML = "";

    // Create and mount new workspace
    const workspace = this.registry.create(id);
    this.activeWorkspace = workspace;

    const editorApi = {
      confirm: this.confirm.bind(this),
      openMap: this.openMap.bind(this),
      initialMapId: this._pendingMapId || null,
      modesEl: this.modesEl,
    };
    await workspace.mount(this.workspaceHost, editorApi);

    // Subscribe to toolbar updates from the new workspace
    if (workspace.subscribeToolbar) {
      this._toolbarUnsub = workspace.subscribeToolbar(() => this._refreshToolbar());
    }
    this._refreshToolbar();

    // Update state and tabs
    this.state.patch({ activeWorkspaceId: id });
    this.syncTabs(id);
  }

  /**
   * Rebuilds the subtoolbar action list from global actions + workspace contextual actions.
   */
  _refreshToolbar() {
    const workspace = this.activeWorkspace;
    const contextualActions = workspace?.getToolbarActions?.() ?? [];

    const globalActions = [
      {
        id: "save",
        label: "Save",
        disabled: !workspace?.canSave?.(),
        onClick: () => this._doSave(),
      },
      {
        id: "undo",
        label: "Undo",
        disabled: !workspace?.canUndo?.(),
        onClick: () => this._doUndo(),
      },
      {
        id: "redo",
        label: "Redo",
        disabled: !workspace?.canRedo?.(),
        onClick: () => this._doRedo(),
      },
      ...(contextualActions.length > 0 ? [{ type: "separator" }] : []),
    ];

    this.subToolbar.setActions([...globalActions, ...contextualActions]);
  }

  /** @private */
  _doSave() {
    if (this.activeWorkspace?.canSave?.()) {
      void this.activeWorkspace.save().catch((error) => {
        console.error("Save failed", error);
      });
    }
  }

  /** @private */
  _doUndo() {
    this.activeWorkspace?.undo?.();
  }

  /** @private */
  _doRedo() {
    this.activeWorkspace?.redo?.();
  }

  syncTabs(activeId) {
    for (const [id, btn] of this.tabs) {
      btn.classList.toggle("is-active", id === activeId);
    }
  }

  async openMap(mapId) {
    if (!mapId) return;
    this._pendingMapId = mapId;
    try {
      await this.switchTo("map");
    } finally {
      this._pendingMapId = null;
    }
  }

  confirm(options) {
    return this.dialogHost.confirm(options);
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

    if (e.code === "KeyS") {
      e.preventDefault();
      if (this.activeWorkspace?.canSave?.()) {
        void this.activeWorkspace.save().catch((error) => {
          console.error("Save failed", error);
        });
      }
    }
  }

  unmount() {
    this._toolbarUnsub?.();
    this._toolbarUnsub = null;
    window.removeEventListener("keydown", this.onKeyDown);
    this.dialogHost.unmount();
    this.subToolbar.destroy();
    if (this.activeWorkspace) {
      this.activeWorkspace.unmount();
      this.activeWorkspace = null;
    }
    this.root.innerHTML = "";
  }
}
