import { LIGHT_PRESETS } from "../../../../shared/data/models/LightPresets.js";

/**
 * Panel for controlling the ambient lighting preview overlay (editor-only),
 * editing the map's persisted ambient settings (doc.lighting),
 * and editing individual authored lights.
 * Also provides presets, duplicate, copy/paste actions for selected lights.
 */
export class LightingPanel {
  /**
   * @param {HTMLElement} el   Container element to render into.
   * @param {import('../MapEditorState.js').MapEditorState} state
   * @param {() => import('../document/MapDocument.js').MapDocument|null} getDocument
   */
  constructor(el, state, getDocument) {
    this.el = el;
    this.state = state;
    this.getDocument = getDocument ?? (() => null);

    this._render();
    this.unsubscribe = this.state.subscribe(() => this._sync());
    this._sync();
  }

  /** Builds the panel DOM once. */
  _render() {
    const presetOptions = LIGHT_PRESETS.map(
      (p) => `<option value="${p.key}">${p.label}</option>`
    ).join("");

    this.el.innerHTML = `
      <div class="panel-section">
        <div class="panel-title">Preview</div>
        <div class="lighting-controls">
          <label class="lighting-row">
            <input type="checkbox" data-preview="enabled" />
            <span>Enable preview</span>
          </label>
          <label class="lighting-row">
            <span>Color</span>
            <input type="color" data-preview="color" />
          </label>
          <label class="lighting-row">
            <span>Intensity</span>
            <input type="range" data-preview="intensity"
              min="0" max="1" step="0.01" />
          </label>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-title">Map Ambient</div>
        <div class="lighting-controls">
          <label class="lighting-row">
            <span>Ambient mode</span>
            <select data-map="ambientMode">
              <option value="cycle">Cycle</option>
              <option value="fixed">Fixed</option>
            </select>
          </label>
          <label class="lighting-row">
            <span>Fixed color</span>
            <input type="color" data-map="fixedColor" />
          </label>
          <label class="lighting-row">
            <span>Fixed intensity</span>
            <input type="range" data-map="fixedIntensity"
              min="0" max="1" step="0.01" />
          </label>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-title">Lights</div>
        <div class="lighting-controls">
          <button type="button" data-action="addTestLight" class="lighting-btn">Add Test Light</button>
        </div>
        <div class="lighting-selected-light">
          <div class="lighting-no-selection">No light selected</div>
          <div class="lighting-light-editor" style="display:none">
            <label class="lighting-row">
              <span>ID</span>
              <span data-light="idDisplay" class="lighting-readonly"></span>
            </label>
            <label class="lighting-row">
              <span>Color</span>
              <input type="color" data-light="color" />
            </label>
            <label class="lighting-row">
              <span>Intensity</span>
              <input type="range" data-light="intensity"
                min="0" max="5" step="0.01" />
            </label>
            <label class="lighting-row">
              <span>Radius</span>
              <input type="range" data-light="radius"
                min="0" max="1024" step="1" />
            </label>
            <label class="lighting-row">
              <span>Falloff</span>
              <input type="range" data-light="falloff"
                min="0" max="1" step="0.01" />
            </label>
            <label class="lighting-row">
              <input type="checkbox" data-light="enabled" />
              <span>Enabled</span>
            </label>
            <label class="lighting-row">
              <input type="checkbox" data-light="visibility" />
              <span>Affects visibility (reveals darkness)</span>
            </label>
            <label class="lighting-row">
              <span>Preset</span>
              <select data-light="preset">
                <option value="">— select —</option>
                ${presetOptions}
              </select>
            </label>
            <button type="button" data-action="applyPreset" class="lighting-btn">Apply Preset</button>
            <div class="lighting-actions">
              <button type="button" data-action="duplicateLight" class="lighting-btn">Duplicate</button>
              <button type="button" data-action="copySettings" class="lighting-btn">Copy Settings</button>
              <button type="button" data-action="pasteSettings" class="lighting-btn">Paste Settings</button>
            </div>
            <button type="button" data-action="deleteLight" class="lighting-btn lighting-btn-danger">Delete</button>
          </div>
        </div>
      </div>
    `;

    this.el.addEventListener("change", (e) => this._handleChange(e));
    this.el.addEventListener("input", (e) => this._handleChange(e));
    this.el.addEventListener("click", (e) => this._handleClick(e));
  }

  /**
   * Handles change/input events from preview, map, and light controls.
   * @param {Event} e
   */
  _handleChange(e) {
    const target = e.target;

    // --- Preview controls (editor-only state) ---
    const previewKey = target.dataset.preview;
    if (previewKey) {
      this.state.update((s) => {
        if (previewKey === "enabled") {
          s.lightingPreview.enabled = target.checked;
        } else if (previewKey === "color") {
          s.lightingPreview.ambientColor = target.value;
        } else if (previewKey === "intensity") {
          s.lightingPreview.ambientIntensity = parseFloat(target.value);
        }
      });
      return;
    }

    // --- Map ambient controls (persisted on document) ---
    const mapKey = target.dataset.map;
    if (mapKey) {
      const doc = this.getDocument();
      if (!doc) return;

      if (mapKey === "ambientMode") {
        doc.updateLighting({ ambientMode: target.value });
      } else if (mapKey === "fixedColor") {
        doc.updateLighting({ fixedAmbient: { color: target.value } });
      } else if (mapKey === "fixedIntensity") {
        doc.updateLighting({ fixedAmbient: { intensity: parseFloat(target.value) } });
      }
      return;
    }

    // --- Selected light controls (persisted on document) ---
    const lightKey = target.dataset.light;
    if (!lightKey) return;

    const lightId = this.state.get().selectedLightId;
    const doc = this.getDocument();
    if (!lightId || !doc) return;

    if (lightKey === "color") {
      doc.updateLight(lightId, { color: target.value });
    } else if (lightKey === "intensity") {
      doc.updateLight(lightId, { intensity: parseFloat(target.value) });
    } else if (lightKey === "radius") {
      doc.updateLight(lightId, { radius: parseFloat(target.value) });
    } else if (lightKey === "falloff") {
      doc.updateLight(lightId, { falloff: parseFloat(target.value) });
    } else if (lightKey === "enabled") {
      doc.updateLight(lightId, { enabled: target.checked });
    } else if (lightKey === "visibility") {
      doc.updateLight(lightId, { visibility: target.checked });
    }
  }

  /**
   * Handles button clicks (add test light, delete, apply preset, duplicate, copy/paste).
   * @param {Event} e
   */
  _handleClick(e) {
    const action = e.target.dataset.action;
    if (!action) return;

    const doc = this.getDocument();
    if (!doc) return;

    if (action === "addTestLight") {
      const map = this.state.get().map;
      const ts = map?.tileSize ?? 16;
      const cx = ((map?.width ?? 20) * ts) / 2;
      const cy = ((map?.height ?? 15) * ts) / 2;
      const id = doc.createLight({
        x: cx,
        y: cy,
        color: "#ffcc88",
        intensity: 1,
        radius: 96,
        falloff: 0.7,
        enabled: true,
      });
      this.state.patch({ selectedLightId: id });
    } else if (action === "deleteLight") {
      const lightId = this.state.get().selectedLightId;
      if (lightId) {
        doc.removeLight(lightId);
        // Cleanup handled by MapEditorApp lightingChanged handler,
        // but clear locally too for immediate UI response.
        this.state.patch({ selectedLightId: null });
      }
    } else if (action === "applyPreset") {
      const select = this.el.querySelector('[data-light="preset"]');
      const key = select?.value;
      if (!key) return;
      const preset = LIGHT_PRESETS.find((p) => p.key === key);
      if (!preset) return;
      const lightId = this.state.get().selectedLightId;
      if (!lightId) return;
      doc.updateLight(lightId, preset.values);
      select.value = "";
    } else if (action === "duplicateLight") {
      const lightId = this.state.get().selectedLightId;
      if (!lightId) return;
      const newId = doc.duplicateLight(lightId);
      if (newId) {
        this.state.patch({ selectedLightId: newId });
      }
    } else if (action === "copySettings") {
      const lightId = this.state.get().selectedLightId;
      if (!lightId) return;
      const light = doc.getLight(lightId);
      if (!light) return;
      const { id: _id, x: _x, y: _y, ...settings } = light;
      this.state.patch({ copiedLightSettings: settings });
    } else if (action === "pasteSettings") {
      const copied = this.state.get().copiedLightSettings;
      if (!copied) return;
      const lightId = this.state.get().selectedLightId;
      if (!lightId) return;
      doc.updateLight(lightId, copied);
    }
  }

  /** Syncs DOM inputs to current editor and document state. */
  _sync() {
    const s = this.state.get();
    const lp = s.lightingPreview;

    // --- Preview controls ---
    const previewEnabled = this.el.querySelector('[data-preview="enabled"]');
    const previewColor = this.el.querySelector('[data-preview="color"]');
    const previewIntensity = this.el.querySelector('[data-preview="intensity"]');

    if (previewEnabled) previewEnabled.checked = !!lp?.enabled;
    if (previewColor) previewColor.value = lp?.ambientColor || "#223344";
    if (previewIntensity) previewIntensity.value = lp?.ambientIntensity ?? 0.6;

    // --- Map ambient controls ---
    const doc = this.getDocument();
    const lighting = doc?.lighting;

    const modeSelect = this.el.querySelector('[data-map="ambientMode"]');
    const fixedColor = this.el.querySelector('[data-map="fixedColor"]');
    const fixedIntensity = this.el.querySelector('[data-map="fixedIntensity"]');

    const hasDoc = !!lighting;
    const isCycle = lighting?.ambientMode === "cycle";

    if (modeSelect) {
      modeSelect.value = lighting?.ambientMode ?? "cycle";
      modeSelect.disabled = !hasDoc;
    }
    if (fixedColor) {
      fixedColor.value = lighting?.fixedAmbient?.color ?? "#000000";
      fixedColor.disabled = !hasDoc || isCycle;
    }
    if (fixedIntensity) {
      fixedIntensity.value = lighting?.fixedAmbient?.intensity ?? 0;
      fixedIntensity.disabled = !hasDoc || isCycle;
    }

    // --- Selected light controls ---
    const noSelEl = this.el.querySelector(".lighting-no-selection");
    const editorEl = this.el.querySelector(".lighting-light-editor");
    const selectedId = s.selectedLightId;
    const light = selectedId ? doc?.getLight(selectedId) : null;

    if (light) {
      if (noSelEl) noSelEl.style.display = "none";
      if (editorEl) editorEl.style.display = "";

      const idDisplay = this.el.querySelector('[data-light="idDisplay"]');
      const lightColor = this.el.querySelector('[data-light="color"]');
      const lightIntensity = this.el.querySelector('[data-light="intensity"]');
      const lightRadius = this.el.querySelector('[data-light="radius"]');
      const lightFalloff = this.el.querySelector('[data-light="falloff"]');
      const lightEnabled = this.el.querySelector('[data-light="enabled"]');
      const lightVisibility = this.el.querySelector('[data-light="visibility"]');

      if (idDisplay) idDisplay.textContent = light.id;
      if (lightColor) lightColor.value = light.color ?? "#ffffff";
      if (lightIntensity) lightIntensity.value = light.intensity ?? 1;
      if (lightRadius) lightRadius.value = light.radius ?? 96;
      if (lightFalloff) lightFalloff.value = light.falloff ?? 0.7;
      if (lightEnabled) lightEnabled.checked = light.enabled !== false;
      if (lightVisibility) lightVisibility.checked = light.visibility === true;

      // --- Preset & action button states ---
      const presetSelect = this.el.querySelector('[data-light="preset"]');
      const applyBtn = this.el.querySelector('[data-action="applyPreset"]');
      const pasteBtn = this.el.querySelector('[data-action="pasteSettings"]');

      if (applyBtn) applyBtn.disabled = !presetSelect?.value;
      if (pasteBtn) pasteBtn.disabled = !s.copiedLightSettings;
    } else {
      if (noSelEl) noSelEl.style.display = "";
      if (editorEl) editorEl.style.display = "none";
    }
  }

  /** Cleans up state subscription. */
  destroy() {
    this.unsubscribe?.();
  }
}
