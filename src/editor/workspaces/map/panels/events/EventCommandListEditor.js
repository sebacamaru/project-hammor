import { EVENT_COMMAND_DEFS, COMMAND_TYPES_IN_ADD_ORDER } from "./EventCommandDefs.js";

/**
 * Inline editor for `components.interaction.commands[]` on a single entity.
 *
 * - DOM is fully rebuilt only on entity change or structural ops (add/delete/
 *   duplicate/move/collapse-toggle); field edits mutate via `doc.updateEntity`
 *   without re-rendering, preserving focus.
 * - Unknown command types are preserved unchanged — only move/duplicate/delete
 *   are exposed for them.
 * - All mutations route through `_commitCommands()` which builds fresh
 *   `components` / `interaction` / `commands` objects (MapDocument.updateEntity
 *   does a shallow merge, so the full path must be cloned).
 * - Expand and pending-focus state are UI-only (not persisted to JSON).
 *   Any number of cards may be expanded simultaneously (multi-expand) so users
 *   can compare adjacent commands. The expanded set resets when the bound
 *   entity changes; structural ops shift members so cards keep their state.
 */
export class EventCommandListEditor {
  /**
   * @param {HTMLElement} root - Container element to mount into.
   * @param {object} opts
   * @param {() => import('../../document/MapDocument.js').MapDocument|null} opts.getDocument
   * @param {((opts: {title:string,message:string,confirmLabel?:string,cancelLabel?:string,tone?:string}) => Promise<boolean>)|null} [opts.confirm]
   *   Promise-based confirm dialog. Falls back to `window.confirm` when absent.
   */
  constructor(root, { getDocument, confirm = null } = {}) {
    this.root = root;
    this.getDocument = getDocument;
    this._confirm = confirm;

    /** @type {object|null} Currently bound entity. */
    this._entity = null;
    /** @type {Array<object>|null} Last rendered commands array reference. */
    this._lastCommandsRef = null;
    /** @type {Set<number>} Indices of currently-expanded cards (multi-expand, UI-only). */
    this._expandedIndexes = new Set();
    /** @type {number|null} Index whose first field should be focused after the next rebuild. */
    this._pendingFocusIndex = null;

    this._onChange = this._onChange.bind(this);
    this._onClick = this._onClick.bind(this);
    this.root.addEventListener("change", this._onChange);
    this.root.addEventListener("click", this._onClick);

    this._renderEmpty("Enable Interaction to edit commands.");
  }

  /**
   * Binds the editor to an entity (or unbinds if null).
   * Rebuilds the DOM when the entity id or commands array reference changes;
   * otherwise leaves the DOM intact to preserve focus.
   * @param {object|null} entity
   */
  setEntity(entity) {
    const prev = this._entity;
    this._entity = entity ?? null;

    if (!entity || !entity.components?.interaction) {
      this._lastCommandsRef = null;
      this._expandedIndexes.clear();
      this._pendingFocusIndex = null;
      this._renderEmpty("Enable Interaction to edit commands.");
      return;
    }

    const commands = entity.components.interaction.commands;
    const idChanged = prev?.id !== entity.id;
    const refChanged = this._lastCommandsRef !== commands;

    if (idChanged) {
      this._expandedIndexes.clear();
      this._pendingFocusIndex = null;
    }

    if (idChanged || refChanged) {
      this._lastCommandsRef = Array.isArray(commands) ? commands : null;
      this._rebuild();
    }
  }

  /** Removes listeners; safe to call multiple times. */
  destroy() {
    this.root.removeEventListener("change", this._onChange);
    this.root.removeEventListener("click", this._onClick);
    this.root.innerHTML = "";
    this._entity = null;
    this._lastCommandsRef = null;
    this._expandedIndexes.clear();
    this._pendingFocusIndex = null;
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  /** Renders a simple text-only placeholder (used when Interaction is disabled). */
  _renderEmpty(message) {
    this.root.innerHTML = `<p class="event-command-empty">${escapeHtml(message)}</p>`;
  }

  /** Full rebuild based on the current entity's commands array. */
  _rebuild() {
    const commands = Array.isArray(this._entity?.components?.interaction?.commands)
      ? this._entity.components.interaction.commands
      : [];

    // Drop any stale expanded indices that point past the new array length.
    if (this._expandedIndexes.size > 0) {
      for (const i of [...this._expandedIndexes]) {
        if (i >= commands.length) this._expandedIndexes.delete(i);
      }
    }

    const listHtml = commands.length === 0
      ? `<p class="event-command-empty">No commands. Add one to get started.</p>`
      : `<div class="event-command-list">${
          commands.map((cmd, i) => this._renderCard(cmd, i, commands.length)).join("")
        }</div>`;

    const addRowHtml = this._renderAddRow();
    this.root.innerHTML = listHtml + addRowHtml;

    this._applyPendingFocus();
  }

  /**
   * If a focus was requested (after add), find the appropriate field in the
   * newly rendered card and focus it. Clears the request either way.
   */
  _applyPendingFocus() {
    if (this._pendingFocusIndex == null) return;
    const i = this._pendingFocusIndex;
    this._pendingFocusIndex = null;

    const commands = this._entity?.components?.interaction?.commands;
    if (!Array.isArray(commands) || !commands[i]) return;
    const def = EVENT_COMMAND_DEFS[commands[i].type];
    const key = def?.firstFocusField;
    if (!key) return;

    // Field keys are simple internal identifiers (`text`, `ms`, `target`, …)
    // and safe to drop into an attribute selector without escaping.
    const el = this.root.querySelector(
      `[data-cmd-index="${i}"] [data-cmd-field="${key}"]`,
    );
    if (!el) return;
    el.focus();
    if (typeof el.select === "function") el.select();
  }

  /**
   * Renders a single command card.
   * @param {object} cmd
   * @param {number} index
   * @param {number} total - Used to disable up/down at list ends.
   * @returns {string}
   */
  _renderCard(cmd, index, total) {
    const def = EVENT_COMMAND_DEFS[cmd?.type];
    const expanded = this._expandedIndexes.has(index);
    // Type class derives from the registry, not from `def.type` — the def
    // objects don't carry a `type` property, and unknown types fall through
    // to the "unsupported" class.
    const typeClass = EVENT_COMMAND_DEFS[cmd?.type] ? cmd.type : "unsupported";
    const cardClasses = ["event-command-card", `event-command-card--type-${typeClass}`];
    if (!def) cardClasses.push("event-command-unsupported");
    cardClasses.push(expanded ? "event-command-card--expanded" : "event-command-card--collapsed");
    if (def && this._cardHasMissingTarget(cmd, def)) {
      cardClasses.push("event-command-card--warning");
    }

    const title = def ? def.label : `Unsupported: ${cmd?.type ?? "?"}`;
    const summary = def && typeof def.summary === "function"
      ? safeSummary(def, cmd)
      : "";

    const header = `
      <header class="event-command-card-header" data-action="toggle">
        <div class="event-command-title-cluster">
          <button data-action="toggle" class="event-command-toggle"
                  title="${expanded ? "Collapse" : "Expand"}"
                  aria-label="${expanded ? "Collapse" : "Expand"}">${expanded ? "▾" : "▸"}</button>
          <span class="event-command-title">${escapeHtml(title)}</span>
          ${summary ? `<span class="event-command-summary">${escapeHtml(summary)}</span>` : ""}
        </div>
        ${this._renderCardActions(index, total)}
      </header>
    `;

    if (!def) {
      const body = expanded
        ? `<p class="event-command-unsupported-note">This command will be preserved but cannot be edited yet.</p>`
        : "";
      return `
        <div class="${cardClasses.join(" ")}" data-cmd-index="${index}">
          ${header}
          ${body}
        </div>
      `;
    }

    const body = expanded
      ? `<div class="event-command-fields">${
          def.fields.map((f) => this._renderField(cmd, f)).join("")
        }</div>`
      : "";

    return `
      <div class="${cardClasses.join(" ")}" data-cmd-index="${index}">
        ${header}
        ${body}
      </div>
    `;
  }

  /** Per-card up/down/duplicate/delete buttons. */
  _renderCardActions(index, total) {
    const upDisabled = index === 0 ? "disabled" : "";
    const downDisabled = index === total - 1 ? "disabled" : "";
    return `
      <div class="event-command-actions">
        <button data-action="up" title="Move up" aria-label="Move up" ${upDisabled}>↑</button>
        <button data-action="down" title="Move down" aria-label="Move down" ${downDisabled}>↓</button>
        <button data-action="duplicate" class="event-command-duplicate"
                title="Duplicate" aria-label="Duplicate">⧉</button>
        <button data-action="delete" title="Delete" aria-label="Delete">✕</button>
      </div>
    `;
  }

  /**
   * Returns true when any field on `cmd` is an entitySelect pointing at an id
   * that no longer exists in the current document.
   */
  _cardHasMissingTarget(cmd, def) {
    for (const fieldDef of def.fields) {
      if (fieldDef.type !== "entitySelect") continue;
      if (this._isMissingTarget(cmd[fieldDef.key])) return true;
    }
    return false;
  }

  /**
   * True when `value` is a non-empty string that is not present in the
   * current document's entity list.
   */
  _isMissingTarget(value) {
    if (value == null || value === "") return false;
    const doc = this.getDocument?.();
    const ids = doc?.entities?.map((e) => e.id) ?? [];
    return !ids.includes(value);
  }

  /**
   * Renders one field row inside a command card.
   * @param {object} cmd
   * @param {{key: string, label: string, type: string, options?: string[], min?: number, max?: number, optional?: boolean}} fieldDef
   * @returns {string}
   */
  _renderField(cmd, fieldDef) {
    const { key, label, type } = fieldDef;
    const value = cmd[key];

    switch (type) {
      case "text":
        return `
          <label class="inspector-field">
            <span>${escapeHtml(label)}</span>
            <input type="text" data-cmd-field="${escapeHtml(key)}"
              value="${escapeHtml(value ?? "")}">
          </label>
        `;

      case "textarea":
        return `
          <label class="inspector-field" style="flex-direction:column; align-items:stretch">
            <span>${escapeHtml(label)}</span>
            <textarea data-cmd-field="${escapeHtml(key)}">${escapeHtml(value ?? "")}</textarea>
          </label>
        `;

      case "number": {
        const min = fieldDef.min != null ? ` min="${fieldDef.min}"` : "";
        const max = fieldDef.max != null ? ` max="${fieldDef.max}"` : "";
        return `
          <label class="inspector-field">
            <span>${escapeHtml(label)}</span>
            <input type="number" data-cmd-field="${escapeHtml(key)}"
              value="${escapeHtml(String(value ?? ""))}"${min}${max}>
          </label>
        `;
      }

      case "checkbox":
        return `
          <label class="inspector-field inspector-checkbox">
            <input type="checkbox" data-cmd-field="${escapeHtml(key)}" ${value ? "checked" : ""}>
            <span>${escapeHtml(label)}</span>
          </label>
        `;

      case "select": {
        const options = (fieldDef.options ?? []).map((opt) =>
          `<option value="${escapeHtml(opt)}" ${opt === value ? "selected" : ""}>${escapeHtml(opt)}</option>`
        ).join("");
        return `
          <label class="inspector-field">
            <span>${escapeHtml(label)}</span>
            <select data-cmd-field="${escapeHtml(key)}">${options}</select>
          </label>
        `;
      }

      case "entitySelect":
        return this._renderEntitySelect(label, key, value);

      default:
        return "";
    }
  }

  /**
   * Renders an entity-id picker. If the current value is not in the document's
   * entity list, it's prepended as a regular selectable option labeled
   * "<id> (missing)" so the value is preserved and the author can re-pick.
   * Missing values also style the field with a warning and show an inline note.
   */
  _renderEntitySelect(label, key, value) {
    const doc = this.getDocument?.();
    const ids = doc?.entities?.map((e) => e.id) ?? [];
    const currentValue = value ?? "";
    const hasMatch = ids.includes(currentValue);
    const isMissing = currentValue !== "" && !hasMatch;

    let options = "";
    if (currentValue === "") {
      options += `<option value="" ${hasMatch ? "" : "selected"}></option>`;
    } else if (!hasMatch) {
      options += `<option value="${escapeHtml(currentValue)}" selected>${escapeHtml(currentValue)} (missing)</option>`;
    }
    for (const id of ids) {
      const sel = id === currentValue ? "selected" : "";
      options += `<option value="${escapeHtml(id)}" ${sel}>${escapeHtml(id)}</option>`;
    }

    const labelClass = isMissing
      ? "inspector-field event-command-field-warning"
      : "inspector-field";
    const warningNote = isMissing
      ? `<p class="event-command-warning-text">Target not found in this map.</p>`
      : "";

    return `
      <label class="${labelClass}">
        <span>${escapeHtml(label)}</span>
        <select data-cmd-field="${escapeHtml(key)}">${options}</select>
      </label>
      ${warningNote}
    `;
  }

  /** Renders the bottom "Add command" row. */
  _renderAddRow() {
    const options = COMMAND_TYPES_IN_ADD_ORDER.map((type) => {
      const def = EVENT_COMMAND_DEFS[type];
      return `<option value="${escapeHtml(type)}">${escapeHtml(def.label)}</option>`;
    }).join("");
    return `
      <div class="event-command-add-row">
        <select data-role="event-command-add-type">${options}</select>
        <button data-action="add">+ Add</button>
      </div>
    `;
  }

  // ── Event handlers ─────────────────────────────────────────────────────

  /** Single delegated handler for input changes inside a card. */
  _onChange(e) {
    const target = /** @type {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} */ (e.target);
    const fieldKey = target.dataset.cmdField;
    if (!fieldKey) return;

    const card = target.closest("[data-cmd-index]");
    if (!card) return;
    const index = Number(card.getAttribute("data-cmd-index"));
    if (!Number.isFinite(index)) return;

    this._handleFieldEdit(index, fieldKey, target);
  }

  /** Single delegated handler for button clicks (up/down/duplicate/delete/toggle/add). */
  _onClick(e) {
    const button = /** @type {HTMLElement} */ (e.target).closest("[data-action]");
    if (!button) return;
    const action = button.getAttribute("data-action");
    if (!action) return;

    if (action === "add") {
      const select = this.root.querySelector('[data-role="event-command-add-type"]');
      const typeKey = select?.value;
      if (typeKey) this._handleAdd(typeKey);
      return;
    }

    const card = button.closest("[data-cmd-index]");
    if (!card) return;
    const index = Number(card.getAttribute("data-cmd-index"));
    if (!Number.isFinite(index)) return;

    if (action === "up") this._handleMove(index, -1);
    else if (action === "down") this._handleMove(index, +1);
    else if (action === "duplicate") this._handleDuplicate(index);
    else if (action === "toggle") this._handleToggleExpand(index);
    // _handleDelete is async; explicitly ignore its promise so the click
    // handler stays synchronous and a rejection cannot leak unhandled.
    else if (action === "delete") void this._handleDelete(index);
  }

  // ── Mutation handlers ──────────────────────────────────────────────────

  /**
   * Parses one field value, applies clamping, prunes optional empties, commits
   * the change, and reflects the final value back into the input if clamping
   * changed it.
   */
  _handleFieldEdit(index, fieldKey, inputEl) {
    const commands = this._entity?.components?.interaction?.commands;
    if (!Array.isArray(commands)) return;
    const cmd = commands[index];
    if (!cmd) return;
    const def = EVENT_COMMAND_DEFS[cmd.type];
    if (!def) return; // unsupported command — no edits exposed
    const fieldDef = def.fields.find((f) => f.key === fieldKey);
    if (!fieldDef) return;

    let stored;
    switch (fieldDef.type) {
      case "checkbox":
        stored = !!inputEl.checked;
        break;

      case "number": {
        let n = Number(inputEl.value);
        if (!Number.isFinite(n)) n = Number(def.defaults[fieldKey]);
        if (!Number.isFinite(n)) n = 0;
        if (typeof fieldDef.min === "number") n = Math.max(fieldDef.min, n);
        if (typeof fieldDef.max === "number") n = Math.min(fieldDef.max, n);
        stored = n;
        break;
      }

      default:
        stored = String(inputEl.value ?? "");
    }

    // Build patch: new commands array with one entry replaced.
    const nextCmd = { ...cmd, [fieldKey]: stored };

    // Prune optional string-shaped fields when they're empty after trimming —
    // keeps authored JSON clean (no `speaker: ""` and friends).
    if (
      fieldDef.optional === true &&
      (fieldDef.type === "text" || fieldDef.type === "textarea" ||
       fieldDef.type === "select" || fieldDef.type === "entitySelect") &&
      typeof stored === "string" &&
      stored.trim() === ""
    ) {
      delete nextCmd[fieldKey];
    }

    const next = commands.slice();
    next[index] = nextCmd;
    this._commitCommands(next);

    // Reflect clamped/normalized value back into the input (no DOM rebuild here).
    if (fieldDef.type === "checkbox") {
      if (inputEl.checked !== stored) inputEl.checked = stored;
    } else {
      const displayValue = String(stored);
      if (inputEl.value !== displayValue) inputEl.value = displayValue;
    }
  }

  /** Swaps the command at `index` with its neighbor in the given direction. */
  _handleMove(index, direction) {
    const commands = this._entity?.components?.interaction?.commands;
    if (!Array.isArray(commands)) return;
    const target = index + direction;
    if (target < 0 || target >= commands.length) return;

    const next = commands.slice();
    [next[index], next[target]] = [next[target], next[index]];

    // Follow-the-card: swap expanded-state membership for the two swapped
    // slots so each card keeps its own expansion across the move.
    const aExpanded = this._expandedIndexes.has(index);
    const bExpanded = this._expandedIndexes.has(target);
    if (aExpanded !== bExpanded) {
      if (aExpanded) {
        this._expandedIndexes.delete(index);
        this._expandedIndexes.add(target);
      } else {
        this._expandedIndexes.delete(target);
        this._expandedIndexes.add(index);
      }
    }

    this._commitCommands(next);
    this._rebuild();
  }

  /** Inserts a deep-ish clone of the command at `index` directly after it. */
  _handleDuplicate(index) {
    const commands = this._entity?.components?.interaction?.commands;
    if (!Array.isArray(commands)) return;
    const cmd = commands[index];
    if (!cmd) return;

    let clone;
    try {
      clone = JSON.parse(JSON.stringify(cmd));
    } catch {
      clone = { ...cmd };
    }

    const next = commands.slice();
    const cloneIndex = index + 1;
    next.splice(cloneIndex, 0, clone);

    // Shift any expanded indices that sat at or beyond the insertion slot up
    // by one, then mark the clone itself expanded.
    if (this._expandedIndexes.size > 0) {
      const shifted = new Set();
      for (const i of this._expandedIndexes) {
        shifted.add(i >= cloneIndex ? i + 1 : i);
      }
      this._expandedIndexes = shifted;
    }
    this._expandedIndexes.add(cloneIndex);
    this._pendingFocusIndex = cloneIndex;

    this._commitCommands(next);
    this._rebuild();
  }

  /** Multi-expand toggle: flips the expansion state of `index` independently of the others. */
  _handleToggleExpand(index) {
    if (this._expandedIndexes.has(index)) this._expandedIndexes.delete(index);
    else this._expandedIndexes.add(index);
    this._rebuild();
  }

  /** Removes the command at `index`, gated by a confirm dialog. */
  async _handleDelete(index) {
    const commands = this._entity?.components?.interaction?.commands;
    if (!Array.isArray(commands)) return;
    if (index < 0 || index >= commands.length) return;

    const ok = await this._askConfirm({
      title: "Delete this command?",
      message: "This cannot be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!ok) return;

    // Re-check the array after the await — the editor could have been
    // unbound or the entity swapped while the dialog was open.
    const currentCommands = this._entity?.components?.interaction?.commands;
    if (!Array.isArray(currentCommands) || index >= currentCommands.length) return;

    const next = currentCommands.slice();
    next.splice(index, 1);

    // Drop the deleted index and shift any higher expanded indices down by one
    // so each surviving card keeps its own state.
    if (this._expandedIndexes.size > 0) {
      const shifted = new Set();
      for (const i of this._expandedIndexes) {
        if (i < index) shifted.add(i);
        else if (i > index) shifted.add(i - 1);
        // i === index → dropped
      }
      this._expandedIndexes = shifted;
    }
    this._pendingFocusIndex = null;

    this._commitCommands(next);
    this._rebuild();
  }

  /** Appends a new command of the given type, with defaults cloned. */
  _handleAdd(typeKey) {
    const def = EVENT_COMMAND_DEFS[typeKey];
    if (!def) return;
    if (!this._entity?.components?.interaction) return;

    const newCmd = { ...def.defaults };

    // For target-based commands, default to the selected entity's id when empty.
    if ((typeKey === "faceEntity" || typeKey === "moveEntity") && !newCmd.target) {
      newCmd.target = this._entity.id ?? "";
    }

    const commands = Array.isArray(this._entity.components.interaction.commands)
      ? this._entity.components.interaction.commands
      : [];
    const next = commands.slice();
    next.push(newCmd);
    // New card is added as expanded (without collapsing others) and gets its
    // first field focused. Order matters: set the expanded membership before
    // _rebuild so _applyPendingFocus finds the now-visible field.
    const insertedIndex = next.length - 1;
    this._expandedIndexes.add(insertedIndex);
    this._pendingFocusIndex = insertedIndex;
    this._commitCommands(next);
    this._rebuild();
  }

  /**
   * Prefers the shell-provided confirm dialog; falls back to `window.confirm`.
   * @param {{title:string,message:string,confirmLabel?:string,cancelLabel?:string,tone?:string}} opts
   * @returns {Promise<boolean>}
   */
  async _askConfirm(opts) {
    if (typeof this._confirm === "function") {
      try {
        return !!(await this._confirm(opts));
      } catch {
        return false;
      }
    }
    return window.confirm(`${opts.title}\n${opts.message}`);
  }

  /**
   * Single mutation chokepoint. Clones `components` and `interaction` so that
   * `MapDocument.updateEntity`'s shallow merge does not destroy sibling data,
   * then publishes the new commands array.
   * @param {Array<object>} nextCommands
   */
  _commitCommands(nextCommands) {
    const doc = this.getDocument?.();
    if (!doc || !this._entity) return;

    const entity = this._entity;
    const components = { ...(entity.components ?? {}) };
    const interaction = { ...(components.interaction ?? { trigger: "action" }) };
    interaction.commands = nextCommands;
    components.interaction = interaction;

    doc.updateEntity(entity.id, { components });

    // The doc mutates the entity in place (Object.assign), so our `_entity`
    // reference still points at the same object and now sees the new commands.
    this._lastCommandsRef = nextCommands;
  }
}

/** Minimal HTML escape for safe attribute / text interpolation. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Calls `def.summary(cmd)` defensively; returns "" on throw. */
function safeSummary(def, cmd) {
  try {
    const out = def.summary(cmd);
    return typeof out === "string" ? out : "";
  } catch {
    return "";
  }
}
