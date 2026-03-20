import { EDITOR_SERVER_ORIGIN } from "../map/MapEditorConfig.js";
import "./styles/database-editor.css";

export class DatabaseEditorApp {
  constructor() {
    this.host = null;
    this._root = null;
    this._isMounted = false;
    this._isSaving = false;

    this._mapCatalog = [];
    this._data = null;

    this._mapSelect = null;
    this._xInput = null;
    this._yInput = null;
    this._saveBtn = null;
    this._statusEl = null;
    this._statusTimeout = null;
  }

  async mount(host) {
    this.host = host;
    this._isMounted = true;

    const root = document.createElement("div");
    root.className = "database-editor";
    root.innerHTML = `
      <div class="database-panel">
        <div class="database-panel-header">Project Settings</div>
        <div class="database-panel-body">
          <div class="database-section-title">Game Start</div>

          <div class="database-field">
            <label>Starting Map</label>
            <select class="js-map-select">
              <option value="" disabled selected>Loading…</option>
            </select>
          </div>

          <div class="database-field">
            <label>Spawn X (tiles)</label>
            <input type="number" class="js-x-input" value="0" step="1">
          </div>

          <div class="database-field">
            <label>Spawn Y (tiles)</label>
            <input type="number" class="js-y-input" value="0" step="1">
          </div>

          <button class="database-save-btn js-save-btn">Save</button>

          <div class="database-status js-status"></div>
        </div>
      </div>
    `;

    this._root = root;
    this._mapSelect = root.querySelector(".js-map-select");
    this._xInput = root.querySelector(".js-x-input");
    this._yInput = root.querySelector(".js-y-input");
    this._saveBtn = root.querySelector(".js-save-btn");
    this._statusEl = root.querySelector(".js-status");

    this._saveBtn.addEventListener("click", () => this._onSave());

    host.appendChild(root);

    this._fetchMapCatalog();
    this._loadProject();
  }

  unmount() {
    this._isMounted = false;
    if (this._statusTimeout) {
      clearTimeout(this._statusTimeout);
      this._statusTimeout = null;
    }
    if (this._root && this.host) {
      this.host.removeChild(this._root);
    }
    this.host = null;
    this._root = null;
    this._mapSelect = null;
    this._xInput = null;
    this._yInput = null;
    this._saveBtn = null;
    this._statusEl = null;
    this._mapCatalog = [];
    this._data = null;
  }

  resize() {}
  update() {}

  canSave() {
    return true;
  }

  async save() {
    await this._onSave();
  }

  getTitle() {
    return "Database";
  }

  // -- Data loading ----------------------------------------------------------

  async _fetchMapCatalog() {
    try {
      const res = await fetch(`${EDITOR_SERVER_ORIGIN}/api/maps`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!this._isMounted) return;
      this._mapCatalog = Array.isArray(data) ? data : [];
    } catch {
      if (!this._isMounted) return;
      this._mapCatalog = [];
    }
    this._populateMapDropdown();
  }

  async _loadProject() {
    try {
      const res = await fetch(`${EDITOR_SERVER_ORIGIN}/api/project`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!this._isMounted) return;
      this._data = data;
    } catch {
      if (!this._isMounted) return;
      this._data = { gameStart: { mapId: "", x: 0, y: 0 } };
      this._setStatus("Failed to load project settings");
    }

    this._applyDataToForm();
    this._populateMapDropdown();
  }

  _applyDataToForm() {
    if (!this._data) return;
    const gs = this._data.gameStart ?? {};
    this._xInput.value = gs.x ?? 0;
    this._yInput.value = gs.y ?? 0;
    // mapId is restored via _populateMapDropdown
  }

  _populateMapDropdown() {
    if (!this._mapSelect) return;
    const select = this._mapSelect;
    select.innerHTML = "";

    if (this._mapCatalog.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.disabled = true;
      opt.selected = true;
      opt.textContent = "No maps available";
      select.appendChild(opt);
      return;
    }

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "-- Select a map --";
    select.appendChild(placeholder);

    for (const map of this._mapCatalog) {
      const opt = document.createElement("option");
      opt.value = map.id;
      const label = map.name || map.id;
      const dims = map.width && map.height ? ` (${map.width}×${map.height})` : "";
      opt.textContent = label + dims;
      select.appendChild(opt);
    }

    // Restore selected mapId if data is already loaded
    const mapId = this._data?.gameStart?.mapId;
    if (mapId) {
      select.value = mapId;
    }
  }

  // -- Save ------------------------------------------------------------------

  async _onSave() {
    if (this._isSaving) return;
    this._isSaving = true;

    const mapId = this._mapSelect.value;
    const x = parseInt(this._xInput.value, 10) || 0;
    const y = parseInt(this._yInput.value, 10) || 0;

    const payload = { gameStart: { mapId, x, y } };
    this._setStatus("Saving…");

    try {
      const res = await fetch(`${EDITOR_SERVER_ORIGIN}/api/project`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!this._isMounted) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._data = payload;
      this._setStatus("Saved");
    } catch {
      if (!this._isMounted) return;
      this._setStatus("Save failed");
    } finally {
      this._isSaving = false;
    }
  }

  // -- Status ----------------------------------------------------------------

  _setStatus(message) {
    if (!this._statusEl) return;
    this._statusEl.textContent = message;
    this._statusEl.classList.add("is-visible");

    if (this._statusTimeout) clearTimeout(this._statusTimeout);
    this._statusTimeout = setTimeout(() => {
      if (this._statusEl) {
        this._statusEl.classList.remove("is-visible");
      }
      this._statusTimeout = null;
    }, 2000);
  }
}
