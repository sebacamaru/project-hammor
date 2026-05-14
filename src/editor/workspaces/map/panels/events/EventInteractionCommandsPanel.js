import { EventCommandListEditor } from "./EventCommandListEditor.js";

/**
 * Right-side panel that hosts the event command list editor.
 *
 * Visible only when:
 *   - the map editor is in "events" mode, AND
 *   - an entity is selected, AND
 *   - that entity has `components.interaction`.
 *
 * The panel owns its own visibility via `this.root.style.display`. The header
 * subtitle shows "<entity id> · N commands". The embedded editor handles the
 * actual command CRUD (Phase 2A).
 *
 * Entity resolution is done fresh from the current document on every sync —
 * no entity reference is cached across syncs, so map hot-swaps cannot leave the
 * editor bound to a detached entity from a previous document.
 */
export class EventInteractionCommandsPanel {
  /**
   * @param {HTMLElement} rootEl
   * @param {import('../../MapEditorState.js').MapEditorState} state
   * @param {() => import('../../document/MapDocument.js').MapDocument|null} getDocument
   * @param {object} [opts]
   * @param {((opts: {title:string,message:string,confirmLabel?:string,cancelLabel?:string,tone?:string}) => Promise<boolean>)|null} [opts.confirm]
   *   Forwarded to `EventCommandListEditor` for destructive prompts.
   */
  constructor(rootEl, state, getDocument, { confirm = null } = {}) {
    this.root = rootEl;
    this.state = state;
    this.getDocument = getDocument;
    this._confirm = confirm;

    /** @type {import('../../document/MapDocument.js').MapDocument|null} */
    this._lastDoc = null;
    /** @type {(() => void)|null} */
    this._docUnsub = null;
    /** @type {boolean} Open/closed UI state — defaults to closed, not persisted. */
    this._isOpen = false;

    this._renderShell();

    this._editor = new EventCommandListEditor(this._editorRootEl, {
      getDocument: this.getDocument,
      confirm: this._confirm,
    });

    this._unsubState = this.state.subscribe(() => this.sync());

    this.sync();
  }

  /** Builds the panel shell DOM once. Subtitle + editor root are filled by sync(). */
  _renderShell() {
    this.root.innerHTML = `
      <div class="editor-panel-header event-interaction-commands-panel__header" data-role="toggle-header">
        <span class="event-interaction-commands-panel__title">Commands</span>
        <span class="event-interaction-commands-panel__subtitle" data-role="subtitle"></span>
        <button type="button" class="event-interaction-commands-panel__toggle"
                data-role="toggle-button" aria-label="Open commands">▼</button>
      </div>
      <div class="editor-panel-body event-interaction-commands-panel">
        <div data-role="commands-editor"></div>
      </div>
    `;
    this._subtitleEl = this.root.querySelector('[data-role="subtitle"]');
    this._editorRootEl = this.root.querySelector('[data-role="commands-editor"]');
    this._toggleBtnEl = this.root.querySelector('[data-role="toggle-button"]');
    this._headerEl = this.root.querySelector('[data-role="toggle-header"]');
    this.root.style.display = "none";

    this._onHeaderClick = this._onHeaderClick.bind(this);
    this._headerEl.addEventListener("click", this._onHeaderClick);
  }

  /**
   * Toggles open/closed when the user clicks anywhere on the header.
   * The button itself is part of the header, so a single listener covers both
   * "click the button" and "click the bar" UX paths.
   */
  _onHeaderClick() {
    this._isOpen = !this._isOpen;
    this.sync();
  }

  /**
   * Re-evaluates visibility, hot-swaps the document subscription if the
   * document changed, re-resolves the selected entity from the current doc,
   * updates the subtitle, and rebinds the editor.
   */
  sync() {
    // Hot-swap doc subscription if the document was replaced (e.g. map reload).
    const doc = this.getDocument?.() ?? null;
    if (doc !== this._lastDoc) {
      this._docUnsub?.();
      this._docUnsub = doc?.subscribe?.((event) => {
        if (event?.type === "entitiesChanged") this.sync();
      }) ?? null;
      this._lastDoc = doc;
    }

    // Always re-resolve the entity from the live document; never trust a
    // cached reference across syncs (map hot-swap can detach old entities).
    const { mode, selectedEntityId } = this.state.get();
    const entity = selectedEntityId && doc
      ? doc.entities.find((e) => e.id === selectedEntityId) ?? null
      : null;

    const shouldShow =
      mode === "events" &&
      entity != null &&
      entity.components?.interaction != null;

    this.root.style.display = shouldShow ? "" : "none";

    if (!shouldShow) {
      this._editor.setEntity(null);
      return;
    }

    const commands = entity.components.interaction.commands;
    const count = Array.isArray(commands) ? commands.length : 0;
    this._subtitleEl.textContent = `${entity.id} · ${count} command${count === 1 ? "" : "s"}`;

    // Open/closed visual state. Editor stays bound either way so opening is
    // instant; the only cost is the hidden body DOM mass.
    this.root.classList.toggle("is-closed", !this._isOpen);
    this._toggleBtnEl.textContent = this._isOpen ? "▲" : "▼";
    this._toggleBtnEl.setAttribute(
      "aria-label",
      this._isOpen ? "Close commands" : "Open commands",
    );

    // Editor diffs internally by entity id + commands array ref, so passing the
    // fresh entity each sync is cheap when nothing changed.
    this._editor.setEntity(entity);
  }

  /** Tears down subscriptions and the embedded editor. Safe to call multiple times. */
  destroy() {
    this._unsubState?.();
    this._unsubState = null;
    this._docUnsub?.();
    this._docUnsub = null;
    if (this._headerEl && this._onHeaderClick) {
      this._headerEl.removeEventListener("click", this._onHeaderClick);
    }
    this._headerEl = null;
    this._toggleBtnEl = null;
    this._editor?.destroy();
    this._editor = null;
    this._lastDoc = null;
    if (this.root) this.root.innerHTML = "";
  }
}
