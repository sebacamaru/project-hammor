import { ShellState } from "./ShellState.js";
import { WorkspaceRegistry } from "./WorkspaceRegistry.js";

export class EditorShell {
  constructor(root) {
    this.root = root;
    this.state = new ShellState();
    this.registry = new WorkspaceRegistry();
    this.activeWorkspace = null;
    this.tabs = new Map();

    this.root.innerHTML = `
      <div class="shell-topbar">
        <div class="shell-tabs"></div>
      </div>
      <div class="shell-workspace-host"></div>
    `;

    this.tabsEl = this.root.querySelector(".shell-tabs");
    this.workspaceHost = this.root.querySelector(".shell-workspace-host");

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

    // Unmount current workspace
    if (this.activeWorkspace) {
      this.activeWorkspace.unmount();
      this.activeWorkspace = null;
    }

    // Clear host
    this.workspaceHost.innerHTML = "";

    // Create and mount new workspace
    const workspace = this.registry.create(id);
    this.activeWorkspace = workspace;

    await workspace.mount(this.workspaceHost);

    // Update state and tabs
    this.state.patch({ activeWorkspaceId: id });
    this.syncTabs(id);
  }

  syncTabs(activeId) {
    for (const [id, btn] of this.tabs) {
      btn.classList.toggle("is-active", id === activeId);
    }
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
    window.removeEventListener("keydown", this.onKeyDown);
    if (this.activeWorkspace) {
      this.activeWorkspace.unmount();
      this.activeWorkspace = null;
    }
    this.root.innerHTML = "";
  }
}
