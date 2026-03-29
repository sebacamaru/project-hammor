import "./styles/dialogs.css";

import { ShellState } from "./ShellState.js";
import { WorkspaceRegistry } from "./WorkspaceRegistry.js";
import { DialogHost } from "./DialogHost.js";
import { EditorSubToolbar } from "../shared/ui/EditorSubToolbar.js";
import { createIconEl } from "../shared/ui/editorIcons.js";

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
        <div class="shell-topbar-center"></div>
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
    this._isPlayInFlight = false;
    this._isStopInFlight = false;
    this._devServerStatus = "stopped";
    this._devServerError = "";

    const _centerEl = this.root.querySelector(".shell-topbar-center");

    this._playBtn = document.createElement("button");
    this._playBtn.className = "topbar-play-btn";
    this._playBtn.title = "Play";
    const _playIcon = createIconEl("play");
    if (_playIcon) this._playBtn.appendChild(_playIcon);
    this._playBtn.appendChild(Object.assign(document.createElement("span"), { textContent: "Play" }));
    this._playBtn.addEventListener("click", () => this._doPlay());
    _centerEl.appendChild(this._playBtn);

    this._stopBtn = document.createElement("button");
    this._stopBtn.className = "topbar-stop-btn";
    this._stopBtn.title = "Stop";
    const _stopIcon = createIconEl("stop");
    if (_stopIcon) this._stopBtn.appendChild(_stopIcon);
    this._stopBtn.appendChild(Object.assign(document.createElement("span"), { textContent: "Stop" }));
    this._stopBtn.style.display = "none";
    this._stopBtn.addEventListener("click", () => this._doStop());
    _centerEl.appendChild(this._stopBtn);

    this._statusBadgeEl = document.createElement("span");
    this._statusBadgeEl.className = "topbar-server-status topbar-server-status--neutral";
    this._statusBadgeEl.textContent = "Server: stopped";
    _centerEl.appendChild(this._statusBadgeEl);

    void this._loadDevServerStatus();

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
   * Left section: Save/Undo/Redo + contextual workspace tools.
   * Center section: Play button (always present, global).
   */
  _refreshToolbar() {
    const workspace = this.activeWorkspace;
    const contextualActions = workspace?.getToolbarActions?.() ?? [];

    const globalActions = [
      {
        id: "save",
        label: "Save",
        icon: "save",
        disabled: !workspace?.canSave?.(),
        onClick: () => this._doSave(),
      },
      {
        id: "undo",
        label: "Undo",
        icon: "undo",
        disabled: !workspace?.canUndo?.(),
        onClick: () => this._doUndo(),
      },
      {
        id: "redo",
        label: "Redo",
        icon: "redo",
        disabled: !workspace?.canRedo?.(),
        onClick: () => this._doRedo(),
      },
      ...(contextualActions.length > 0 ? [{ type: "separator" }] : []),
    ];

    this._playBtn.disabled = this._isPlayInFlight || this._isStopInFlight;
    this._updateStopButton();

    this.subToolbar.setActions({
      left:  [...globalActions, ...contextualActions],
      right: [],
    });
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

  /**
   * Fetches the current game server status from the editor-server and updates
   * the status badge. Fails gracefully if the editor-server is unreachable.
   * @returns {Promise<void>}
   */
  async _loadDevServerStatus() {
    try {
      const res = await fetch("http://localhost:3032/api/dev/status");
      const data = await res.json();
      this._devServerStatus = data.status ?? "stopped";
      this._devServerError = data.lastError ?? "";
    } catch {
      this._devServerStatus = "unavailable";
      this._devServerError = "";
    }
    this._updateStatusBadge();
  }

  /**
   * Updates the status badge element to reflect the current _devServerStatus.
   */
  _updateStatusBadge() {
    const MAP = {
      stopped:     { label: "Server: stopped",     mod: "neutral" },
      starting:    { label: "Server: starting",    mod: "warning" },
      restarting:  { label: "Server: restarting",  mod: "warning" },
      running:     { label: "Server: running",     mod: "success" },
      stopping:    { label: "Server: stopping",    mod: "warning" },
      error:       { label: "Server: error",       mod: "danger"  },
      unavailable: { label: "Server: unavailable", mod: "neutral" },
    };
    const { label, mod } = MAP[this._devServerStatus] ?? MAP.unavailable;
    this._statusBadgeEl.textContent = label;
    this._statusBadgeEl.className = `topbar-server-status topbar-server-status--${mod}`;
    this._updateStopButton();
  }

  /**
   * Updates the Stop button visibility and disabled state based on the current
   * dev server status and whether a stop request is in-flight.
   * Visible when status is "running" or a stop is in-flight (stays visible-but-disabled
   * during the request so the user can see which button they pressed).
   * @private
   */
  _updateStopButton() {
    const visible = this._devServerStatus === "running" || this._isStopInFlight;
    this._stopBtn.style.display = visible ? "" : "none";
    this._stopBtn.disabled = this._isStopInFlight;
  }

  /**
   * Saves the active workspace (if dirty), then POSTs to /api/dev/play to restart
   * the game server. If the save fails the launch is aborted. Opens the game client
   * in a new tab after a successful restart. Disables the Play button while the
   * request is in-flight to prevent double-clicks.
   * @returns {Promise<void>}
   */
  async _doPlay() {
    if (this._isPlayInFlight) return;

    this._isPlayInFlight = true;
    this._refreshToolbar();

    // 1. Save first — abort entirely if save fails (no tab opened yet)
    if (this.activeWorkspace?.canSave?.()) {
      try {
        await this.activeWorkspace.save();
      } catch (err) {
        console.error("[EditorShell] Pre-play save failed", err);
        this.activeWorkspace?.setOperationStatus?.("error", "Save failed — launch aborted");
        this._isPlayInFlight = false;
        this._refreshToolbar();
        return;
      }
    }

    // 2. Open placeholder tab after save succeeds — avoids popup blocker while
    //    ensuring no tab is opened when the save fails
    let previewWindow = null;
    try { previewWindow = window.open("about:blank", "_blank"); } catch { /* blocked */ }

    // 3. Kick off server restart
    this._devServerStatus = "restarting";
    this._updateStatusBadge();
    this.activeWorkspace?.setOperationStatus?.("saving", "Restarting server...");

    let result;
    try {
      const res = await fetch("http://localhost:3032/api/dev/play", { method: "POST" });
      result = await res.json();
    } catch (err) {
      result = { ok: false, error: err.message };
    } finally {
      this._isPlayInFlight = false;
      this._refreshToolbar();
    }

    if (result.ok) {
      if (previewWindow && !previewWindow.closed) {
        try { previewWindow.location.href = "http://localhost:5173/"; } catch (err) { console.error("[Play] Failed to navigate preview tab:", err); }
      }
      this.activeWorkspace?.setOperationStatus?.("saved", "Server ready", { autoReset: true });
    } else {
      try { previewWindow?.close(); } catch { /* ignore */ }
      this.activeWorkspace?.setOperationStatus?.("error", result.error ?? "Launch failed");
    }

    // Re-fetch authoritative status from server
    void this._loadDevServerStatus();
  }

  /**
   * POSTs to /api/dev/stop to stop the game server. Guards against double-clicks
   * and concurrent Play requests. Keeps the Stop button visible-but-disabled while
   * the request is in-flight. Refreshes authoritative status after completion.
   * @returns {Promise<void>}
   */
  async _doStop() {
    if (this._isStopInFlight || this._isPlayInFlight) return;

    this._isStopInFlight = true;
    this._devServerStatus = "stopping";
    this._updateStatusBadge();
    this._refreshToolbar();

    let result;
    try {
      const res = await fetch("http://localhost:3032/api/dev/stop", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        result = { ok: false, error: data.error ?? `HTTP ${res.status}` };
      } else {
        result = await res.json();
      }
    } catch (err) {
      result = { ok: false, error: err.message };
    } finally {
      this._isStopInFlight = false;
      this._refreshToolbar();
    }

    if (result.ok) {
      this.activeWorkspace?.setOperationStatus?.("saved", "Server stopped", { autoReset: true });
    } else {
      this.activeWorkspace?.setOperationStatus?.("error", result.error ?? "Stop failed");
    }

    void this._loadDevServerStatus();
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
