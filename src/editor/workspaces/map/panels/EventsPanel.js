/**
 * Side panel for Events mode.
 * Shows hint text, selection status, and a sectioned inspector for the selected entity.
 *
 * Sections: Identity, Collision, Visual, Interaction.
 *
 * Interaction is presence-toggled — the "Enabled" checkbox is a synthetic UI state
 * mapped to the presence of components.interaction.
 */
export class EventsPanel {
  /**
   * @param {HTMLElement} el - Container element to mount into.
   * @param {import('../MapEditorState.js').MapEditorState} state
   * @param {() => import('../document/MapDocument.js').MapDocument|null} getDocument
   * @param {object} [opts]
   * @param {(opts: {title: string, message: string, confirmLabel?: string, cancelLabel?: string, tone?: string}) => Promise<boolean>} [opts.confirm]
   *   Optional async confirm dialog. Used to guard destructive actions (disabling
   *   Interaction when commands exist). When omitted, destructive actions proceed
   *   without confirmation.
   */
  constructor(el, state, getDocument, { confirm } = {}) {
    this.el = el;
    this.state = state;
    this.getDocument = getDocument;
    this._confirm = confirm ?? null;

    /** @type {string|null} Last synced entity id — used to detect selection change. */
    this._lastSyncedId = null;

    this.render();
    this.unsubscribe = this.state.subscribe(() => this.sync());
    this.sync();
  }

  /** Builds the panel HTML once. Input values are populated by sync(). */
  render() {
    this.el.innerHTML = `
      <div class="editor-panel-header">Events</div>
      <div class="editor-panel-body events-panel">
        <div class="events-hint" data-role="hint">Click an entity to select</div>
        <div class="events-selection" data-role="selection">No entity selected</div>
        <div class="events-inspector" data-role="inspector" style="display:none">
          ${this._renderIdentitySection()}
          ${this._renderCollisionSection()}
          ${this._renderVisualSection()}
          ${this._renderInteractionSection()}
        </div>
      </div>
    `;

    this._hintEl = this.el.querySelector('[data-role="hint"]');
    this._selectionEl = this.el.querySelector('[data-role="selection"]');
    this._inspectorEl = this.el.querySelector('[data-role="inspector"]');

    // Cache field inputs
    this._fields = {
      id: this.el.querySelector('[data-field="id"]'),
      prefabId: this.el.querySelector('[data-field="prefabId"]'),
      solid: this.el.querySelector('[data-field="solid"]'),
      hitboxOffsetX: this.el.querySelector('[data-field="hitbox-offsetX"]'),
      hitboxOffsetY: this.el.querySelector('[data-field="hitbox-offsetY"]'),
      hitboxWidth: this.el.querySelector('[data-field="hitbox-width"]'),
      hitboxHeight: this.el.querySelector('[data-field="hitbox-height"]'),
      visualSheet: this.el.querySelector('[data-field="visual-sheet"]'),
      visualFrameWidth: this.el.querySelector('[data-field="visual-frameWidth"]'),
      visualFrameHeight: this.el.querySelector('[data-field="visual-frameHeight"]'),
      visualDirection: this.el.querySelector('[data-field="visual-direction"]'),
      visualPattern: this.el.querySelector('[data-field="visual-pattern"]'),
      interactionEnabled: this.el.querySelector('[data-field="interaction-enabled"]'),
      interactionTrigger: this.el.querySelector('[data-field="interaction-trigger"]'),
    };

    // Inspector field change handlers (fires on blur/enter, not every keystroke)
    this._inspectorEl.addEventListener("change", (e) => {
      this._handleFieldChange(e.target);
    });
  }

  /**
   * Builds the Identity section HTML.
   * @returns {string}
   */
  _renderIdentitySection() {
    return `
      <section class="events-panel-section">
        <h3 class="events-panel-section-title">Identity</h3>
        <label class="inspector-field">
          <span>ID</span>
          <input type="text" data-field="id">
        </label>
        <label class="inspector-field">
          <span>Prefab</span>
          <input type="text" data-field="prefabId">
        </label>
      </section>
    `;
  }

  /**
   * Builds the Collision section HTML.
   * @returns {string}
   */
  _renderCollisionSection() {
    return `
      <section class="events-panel-section">
        <h3 class="events-panel-section-title">Collision</h3>
        <label class="inspector-field inspector-checkbox">
          <input type="checkbox" data-field="solid">
          <span>Solid</span>
        </label>
        <fieldset class="inspector-fieldset">
          <legend>Hitbox</legend>
          <label class="inspector-field">
            <span>offsetX</span>
            <input type="number" data-field="hitbox-offsetX">
          </label>
          <label class="inspector-field">
            <span>offsetY</span>
            <input type="number" data-field="hitbox-offsetY">
          </label>
          <label class="inspector-field">
            <span>width</span>
            <input type="number" data-field="hitbox-width">
          </label>
          <label class="inspector-field">
            <span>height</span>
            <input type="number" data-field="hitbox-height">
          </label>
        </fieldset>
      </section>
    `;
  }

  /**
   * Builds the Visual section HTML.
   * @returns {string}
   */
  _renderVisualSection() {
    return `
      <section class="events-panel-section">
        <h3 class="events-panel-section-title">Visual</h3>
        <label class="inspector-field">
          <span>Sheet</span>
          <input type="text" data-field="visual-sheet" placeholder="npc_01">
        </label>
        <label class="inspector-field">
          <span>Frame W</span>
          <input type="number" data-field="visual-frameWidth">
        </label>
        <label class="inspector-field">
          <span>Frame H</span>
          <input type="number" data-field="visual-frameHeight">
        </label>
        <label class="inspector-field">
          <span>Direction</span>
          <select data-field="visual-direction">
            <option value="down">Down</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="up">Up</option>
          </select>
        </label>
        <label class="inspector-field">
          <span>Pattern</span>
          <input type="number" data-field="visual-pattern" min="0">
        </label>
      </section>
    `;
  }

  /**
   * Builds the Interaction section HTML.
   * Trigger select is single-option for Phase 1; markup is ready for future
   * touch/auto options.
   * @returns {string}
   */
  _renderInteractionSection() {
    return `
      <section class="events-panel-section">
        <h3 class="events-panel-section-title">Interaction</h3>
        <label class="inspector-field inspector-checkbox">
          <input type="checkbox" data-field="interaction-enabled">
          <span>Enabled</span>
        </label>
        <label class="inspector-field">
          <span>Trigger</span>
          <select data-field="interaction-trigger">
            <option value="action">Action (E key)</option>
          </select>
        </label>
      </section>
    `;
  }

  /**
   * Syncs hint, selection text, and inspector fields with current state.
   * Skips repopulating fields that currently have focus to avoid clobbering mid-edit.
   */
  sync() {
    const { selectedEntityId, entityPlaceMode } = this.state.get();

    // Hint text
    this._hintEl.textContent = entityPlaceMode
      ? "Click on the map to place a new entity"
      : "Click an entity to select";

    // Selection text
    this._selectionEl.textContent = selectedEntityId
      ? `Selected: ${selectedEntityId}`
      : "No entity selected";

    // Inspector visibility
    const entity = this._findSelectedEntity();
    const hasSelection = entity != null;
    this._inspectorEl.style.display = hasSelection ? "" : "none";
    this._hintEl.style.display = hasSelection ? "none" : "";
    this._selectionEl.style.display = hasSelection ? "none" : "";

    if (!hasSelection) {
      this._lastSyncedId = null;
      return;
    }

    // Populate fields — skip focused input to avoid clobbering mid-edit
    const focused = document.activeElement;
    const selectionChanged = this._lastSyncedId !== selectedEntityId;
    this._lastSyncedId = selectedEntityId;

    // Identity
    if (focused !== this._fields.id || selectionChanged) {
      this._fields.id.value = entity.id ?? "";
    }
    if (focused !== this._fields.prefabId || selectionChanged) {
      this._fields.prefabId.value = entity.prefabId ?? "";
    }

    // Collision
    const collision = entity.components?.collision ?? {};
    const hitbox = collision.hitbox ?? {};

    if (focused !== this._fields.solid || selectionChanged) {
      this._fields.solid.checked = !!collision.solid;
    }
    if (focused !== this._fields.hitboxOffsetX || selectionChanged) {
      this._fields.hitboxOffsetX.value = hitbox.offsetX ?? 0;
    }
    if (focused !== this._fields.hitboxOffsetY || selectionChanged) {
      this._fields.hitboxOffsetY.value = hitbox.offsetY ?? 0;
    }
    if (focused !== this._fields.hitboxWidth || selectionChanged) {
      this._fields.hitboxWidth.value = hitbox.width ?? 0;
    }
    if (focused !== this._fields.hitboxHeight || selectionChanged) {
      this._fields.hitboxHeight.value = hitbox.height ?? 0;
    }

    // Visual
    const visual = entity.components?.visual ?? {};
    if (focused !== this._fields.visualSheet || selectionChanged) {
      this._fields.visualSheet.value = visual.sheet ?? "";
    }
    if (focused !== this._fields.visualFrameWidth || selectionChanged) {
      this._fields.visualFrameWidth.value = visual.frameWidth ?? 16;
    }
    if (focused !== this._fields.visualFrameHeight || selectionChanged) {
      this._fields.visualFrameHeight.value = visual.frameHeight ?? 16;
    }
    if (focused !== this._fields.visualDirection || selectionChanged) {
      this._fields.visualDirection.value = visual.direction ?? "down";
    }
    if (focused !== this._fields.visualPattern || selectionChanged) {
      this._fields.visualPattern.value = visual.pattern ?? 1;
    }

    // Interaction
    const interaction = entity.components?.interaction ?? null;
    const interactionEnabled = interaction != null;
    if (focused !== this._fields.interactionEnabled || selectionChanged) {
      this._fields.interactionEnabled.checked = interactionEnabled;
    }
    if (focused !== this._fields.interactionTrigger || selectionChanged) {
      this._fields.interactionTrigger.value = interaction?.trigger ?? "action";
    }
    this._fields.interactionTrigger.disabled = !interactionEnabled;
  }

  /**
   * Handles a field change event from the inspector.
   * Builds the appropriate patch and calls doc.updateEntity().
   * @param {HTMLInputElement|HTMLSelectElement} input
   */
  _handleFieldChange(input) {
    const field = input.dataset.field;
    if (!field) return;

    const doc = this.getDocument?.();
    const { selectedEntityId } = this.state.get();
    if (!doc || !selectedEntityId) return;

    const entity = doc.entities.find((e) => e.id === selectedEntityId);
    if (!entity) return;

    if (field === "id") {
      const newId = input.value.trim();
      if (!newId || newId === selectedEntityId) {
        input.value = selectedEntityId;
        return;
      }
      // Uniqueness check
      const duplicate = doc.entities.some((e) => e.id === newId && e !== entity);
      if (duplicate) {
        input.value = selectedEntityId;
        return;
      }
      doc.updateEntity(selectedEntityId, { id: newId });
      this.state.patch({ selectedEntityId: newId });
      return;
    }

    if (field === "prefabId") {
      doc.updateEntity(selectedEntityId, { prefabId: input.value });
      return;
    }

    if (field.startsWith("visual-")) {
      this._applyVisualChange(doc, entity, selectedEntityId);
      return;
    }

    if (field === "interaction-enabled") {
      // Fire-and-forget the async path; restoring the checkbox on cancel happens inside.
      void this._applyInteractionEnabledChange(doc, entity, selectedEntityId);
      return;
    }

    if (field === "interaction-trigger") {
      this._applyInteractionTriggerChange(doc, entity, selectedEntityId);
      return;
    }

    // Collision fields: rebuild the full components.collision object
    this._applyCollisionChange(doc, entity, selectedEntityId);
  }

  /**
   * Reads all collision fields from the inspector and applies them as a single patch.
   * Always sends the full components tree (shallow merge replaces top-level keys).
   * @param {import('../document/MapDocument.js').MapDocument} doc
   * @param {object} entity
   * @param {string} entityId
   */
  _applyCollisionChange(doc, entity, entityId) {
    const solid = this._fields.solid.checked;

    const offsetX = parseInt(this._fields.hitboxOffsetX.value, 10);
    const offsetY = parseInt(this._fields.hitboxOffsetY.value, 10);
    const width = parseInt(this._fields.hitboxWidth.value, 10);
    const height = parseInt(this._fields.hitboxHeight.value, 10);

    if (Number.isNaN(offsetX) || Number.isNaN(offsetY) ||
        Number.isNaN(width) || Number.isNaN(height)) {
      return;
    }

    const components = { ...(entity.components ?? {}) };
    components.collision = {
      ...(components.collision ?? {}),
      solid,
      hitbox: {
        offsetX,
        offsetY,
        width: Math.max(1, width),
        height: Math.max(1, height),
      },
    };

    doc.updateEntity(entityId, { components });
  }

  /**
   * Reads all visual fields from the inspector and applies them as a single patch.
   * Uses spread to preserve existing collision (and other) component data.
   * @param {import('../document/MapDocument.js').MapDocument} doc
   * @param {object} entity
   * @param {string} entityId
   */
  _applyVisualChange(doc, entity, entityId) {
    const sheet = this._fields.visualSheet.value.trim();
    const frameWidth = Math.max(1, parseInt(this._fields.visualFrameWidth.value, 10) || 16);
    const frameHeight = Math.max(1, parseInt(this._fields.visualFrameHeight.value, 10) || 16);
    const direction = this._fields.visualDirection.value;
    const pattern = Math.max(0, parseInt(this._fields.visualPattern.value, 10) || 0);

    doc.updateEntity(entityId, {
      components: {
        ...entity.components,
        visual: { type: "character", sheet, frameWidth, frameHeight, direction, pattern },
      },
    });
  }

  /**
   * Toggles presence of components.interaction. Disabling while commands are
   * authored is gated by an async confirm dialog when available.
   * @param {import('../document/MapDocument.js').MapDocument} doc
   * @param {object} entity
   * @param {string} entityId
   */
  async _applyInteractionEnabledChange(doc, entity, entityId) {
    const enabled = this._fields.interactionEnabled.checked;
    const existing = entity.components?.interaction ?? null;

    if (enabled && existing) {
      // Already enabled — preserve trigger and commands exactly.
      this.sync();
      return;
    }

    const components = { ...(entity.components ?? {}) };

    if (enabled) {
      components.interaction = { trigger: "action", commands: [] };
      doc.updateEntity(entityId, { components });
      return;
    }

    const hasCommands = Array.isArray(existing?.commands) && existing.commands.length > 0;
    if (hasCommands && this._confirm) {
      const count = existing.commands.length;
      const ok = await this._confirm({
        title: "Disable interaction?",
        message: `This entity has ${count} authored command${count === 1 ? "" : "s"}. Disabling will discard them.`,
        confirmLabel: "Disable",
        cancelLabel: "Cancel",
        tone: "danger",
      });
      if (!ok) {
        this._fields.interactionEnabled.checked = true;
        return;
      }
    }

    delete components.interaction;
    doc.updateEntity(entityId, { components });
  }

  /**
   * Updates components.interaction.trigger without touching the commands array.
   * Defensive: bails if interaction is somehow absent.
   * @param {import('../document/MapDocument.js').MapDocument} doc
   * @param {object} entity
   * @param {string} entityId
   */
  _applyInteractionTriggerChange(doc, entity, entityId) {
    const existing = entity.components?.interaction;
    if (!existing) return;

    const components = { ...(entity.components ?? {}) };
    components.interaction = {
      ...existing,
      trigger: this._fields.interactionTrigger.value,
    };

    doc.updateEntity(entityId, { components });
  }

  /**
   * Finds the currently selected entity in the document.
   * @returns {object|null}
   */
  _findSelectedEntity() {
    const { selectedEntityId } = this.state.get();
    if (!selectedEntityId) return null;
    const doc = this.getDocument?.();
    if (!doc) return null;
    return doc.entities.find((e) => e.id === selectedEntityId) ?? null;
  }

  /** Cleans up the state subscription. */
  destroy() {
    this.unsubscribe?.();
  }
}
