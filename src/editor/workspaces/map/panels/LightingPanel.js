import { LIGHT_PRESETS } from "../../../../shared/data/models/LightPresets.js";

/**
 * Panel for the Lights mode.
 *
 * Top of panel: global Preview (editor-only) + Map Ambient (persisted) sections.
 * Below: hint + selection text, then a sectioned inspector for the selected light
 * (Identity, Properties, Preset, Actions).
 *
 * Add / Delete actions live in the top toolbar (see MapEditorApp.getToolbarActions).
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
      <div class="editor-panel-header">Lighting</div>
      <div class="editor-panel-body lighting-panel">

        <div class="events-inspector">
          <section class="events-panel-section">
            <h3 class="events-panel-section-title">Preview</h3>
            <label class="inspector-field inspector-checkbox">
              <input type="checkbox" data-preview="enabled">
              <span>Enable preview</span>
            </label>
            <label class="inspector-field">
              <span>Color</span>
              <input type="color" data-preview="color">
            </label>
            <label class="inspector-field">
              <span>Intensity</span>
              <input type="range" data-preview="intensity" min="0" max="1" step="0.01">
            </label>
          </section>

          <section class="events-panel-section">
            <h3 class="events-panel-section-title">Map Ambient</h3>
            <label class="inspector-field">
              <span>Ambient mode</span>
              <select data-map="ambientMode">
                <option value="cycle">Cycle</option>
                <option value="fixed">Fixed</option>
              </select>
            </label>
            <label class="inspector-field">
              <span>Fixed color</span>
              <input type="color" data-map="fixedColor">
            </label>
            <label class="inspector-field">
              <span>Fixed intensity</span>
              <input type="range" data-map="fixedIntensity" min="0" max="1" step="0.01">
            </label>
          </section>
        </div>

        <div class="events-hint" data-role="hint">Click a light to select</div>
        <div class="events-selection" data-role="selection">No light selected</div>

        <div class="events-inspector" data-role="inspector" style="display:none">
          <section class="events-panel-section">
            <h3 class="events-panel-section-title">Identity</h3>
            <label class="inspector-field">
              <span>ID</span>
              <span data-light="idDisplay" class="inspector-readonly"></span>
            </label>
          </section>

          <section class="events-panel-section">
            <h3 class="events-panel-section-title">Properties</h3>
            <label class="inspector-field">
              <span>Color</span>
              <input type="color" data-light="color">
            </label>
            <label class="inspector-field">
              <span>Intensity</span>
              <input type="range" data-light="intensity" min="0" max="5" step="0.01">
            </label>
            <label class="inspector-field">
              <span>Radius</span>
              <input type="range" data-light="radius" min="0" max="1024" step="1">
            </label>
            <label class="inspector-field">
              <span>Falloff</span>
              <input type="range" data-light="falloff" min="0" max="1" step="0.01">
            </label>
            <label class="inspector-field inspector-checkbox">
              <input type="checkbox" data-light="enabled">
              <span>Enabled</span>
            </label>
            <label class="inspector-field inspector-checkbox">
              <input type="checkbox" data-light="visibility">
              <span>Affects visibility</span>
            </label>
          </section>

          <section class="events-panel-section">
            <h3 class="events-panel-section-title">Preset</h3>
            <label class="inspector-field">
              <span>Preset</span>
              <select data-light="preset">
                <option value="">— select —</option>
                ${presetOptions}
              </select>
            </label>
            <button type="button" data-action="applyPreset" class="lighting-btn">Apply Preset</button>
          </section>

          <section class="events-panel-section">
            <h3 class="events-panel-section-title">Actions</h3>
            <div class="lighting-actions">
              <button type="button" data-action="duplicateLight" class="lighting-btn">Duplicate</button>
              <button type="button" data-action="copySettings" class="lighting-btn">Copy Settings</button>
              <button type="button" data-action="pasteSettings" class="lighting-btn">Paste Settings</button>
            </div>
          </section>
        </div>
      </div>
    `;

    this._hintEl = this.el.querySelector('[data-role="hint"]');
    this._selectionEl = this.el.querySelector('[data-role="selection"]');
    this._inspectorEl = this.el.querySelector('[data-role="inspector"]');

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
   * Handles button clicks (apply preset, duplicate, copy/paste settings).
   * Add Light / Delete Light live in the toolbar.
   * @param {Event} e
   */
  _handleClick(e) {
    const action = e.target.dataset.action;
    if (!action) return;

    const doc = this.getDocument();
    if (!doc) return;

    if (action === "applyPreset") {
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

    // --- Hint + selection text ---
    const selectedId = s.selectedLightId;
    const light = selectedId ? doc?.getLight(selectedId) : null;
    const hasSelection = !!light;

    if (this._hintEl) {
      this._hintEl.textContent = s.lightPlaceMode
        ? "Click on the map to place a new light"
        : "Click a light to select";
      this._hintEl.style.display = hasSelection ? "none" : "";
    }
    if (this._selectionEl) {
      this._selectionEl.textContent = hasSelection
        ? `Selected: ${light.id}`
        : "No light selected";
      this._selectionEl.style.display = hasSelection ? "none" : "";
    }
    if (this._inspectorEl) {
      this._inspectorEl.style.display = hasSelection ? "" : "none";
    }

    // --- Selected light controls ---
    if (hasSelection) {
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
    }
  }

  /** Cleans up state subscription. */
  destroy() {
    this.unsubscribe?.();
  }
}
