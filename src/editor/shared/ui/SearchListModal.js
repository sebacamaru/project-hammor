import { ModalDialog } from "./ModalDialog.js";
import "./SearchListModal.css";

/**
 * Reusable searchable list picker dialog built on top of ModalDialog.
 *
 * Displays a filterable list of items with keyboard navigation,
 * mouse selection, and confirm/cancel actions. Generic — no domain
 * assumptions about item shape beyond an optional default convention.
 *
 * Default item convention (all fields optional):
 * ```
 * { id, title, subtitle, meta }
 * ```
 */
export class SearchListModal {
  /**
   * @param {object} opts
   * @param {string} opts.title — Dialog title
   * @param {object[]} opts.items — Array of item objects
   * @param {string} [opts.placeholder] — Search input placeholder (default "Search…")
   * @param {(item: object) => string} [opts.getSearchText] — Returns searchable text for an item
   * @param {(item: object, state: {selected: boolean, query: string}) => HTMLElement} [opts.renderItem] — Custom row renderer; must return an HTMLElement
   * @param {(item: object) => void} opts.onConfirm — Called with the selected item on confirm
   * @param {() => void} [opts.onClose] — Called when the modal closes (cancel, backdrop, Escape)
   * @param {string} [opts.confirmText] — Confirm button label (default "Select")
   * @param {string} [opts.cancelText] — Cancel button label (default "Cancel")
   * @param {string} [opts.className] — Extra CSS class on the modal panel
   * @param {string} [opts.selectedId] — ID of the item to preselect on first render
   */
  constructor({
    title,
    items,
    placeholder,
    getSearchText,
    renderItem,
    onConfirm,
    onClose,
    confirmText,
    cancelText,
    className,
    selectedId,
  } = {}) {
    this._items = items || [];
    this._filteredItems = [];
    this._query = "";
    this._selectedIndex = -1;
    this._initialSelectedId = selectedId ?? null;

    this._getSearchText = getSearchText || null;
    this._renderItem = renderItem || null;
    this._onConfirm = onConfirm || null;
    this._onClose = onClose || null;

    // ── Build content DOM ──

    const content = document.createElement("div");
    content.className = "search-list-content";

    // Search input
    const searchWrap = document.createElement("div");
    searchWrap.className = "search-list-search-wrap";

    const searchInput = document.createElement("input");
    searchInput.className = "search-list-search";
    searchInput.type = "text";
    searchInput.placeholder = placeholder || "Search\u2026";
    searchInput.spellcheck = false;
    searchInput.autocomplete = "off";
    searchWrap.appendChild(searchInput);
    content.appendChild(searchWrap);

    // Results list
    const listEl = document.createElement("div");
    listEl.className = "search-list-results";
    content.appendChild(listEl);

    // Empty state
    const emptyEl = document.createElement("div");
    emptyEl.className = "search-list-empty";
    emptyEl.textContent = "No results";
    emptyEl.style.display = "none";
    content.appendChild(emptyEl);

    this._searchInput = searchInput;
    this._listEl = listEl;
    this._emptyEl = emptyEl;
    this._contentEl = content;

    // ── Build footer DOM ──

    const footer = document.createElement("div");
    footer.className = "search-list-footer";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "dialog-btn dialog-btn-cancel";
    cancelBtn.textContent = cancelText || "Cancel";
    cancelBtn.addEventListener("click", () => this.close());

    const confirmBtn = document.createElement("button");
    confirmBtn.className = "dialog-btn dialog-btn-confirm";
    confirmBtn.textContent = confirmText || "Select";
    confirmBtn.disabled = true;
    confirmBtn.addEventListener("click", () => this._confirm());

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    this._confirmBtn = confirmBtn;

    // ── Wire input events (scoped to content, not window) ──

    searchInput.addEventListener("input", () => {
      this._query = searchInput.value;
      this._filter();
    });

    // Keyboard: scoped to the search input — no window-level listener
    searchInput.addEventListener("keydown", (e) => {
      this._handleKeyDown(e);
    });

    // Also handle keyboard on the list container (for when focus is there)
    listEl.addEventListener("keydown", (e) => {
      this._handleKeyDown(e);
    });

    // ── Create ModalDialog ──

    this._modal = new ModalDialog({
      title,
      content,
      footer,
      onClose: () => {
        if (this._onClose) this._onClose();
      },
      className: "search-list-modal" + (className ? ` ${className}` : ""),
    });

    // Initial filter (show all items)
    this._filter();
  }

  /** @returns {boolean} Whether the modal is currently open */
  isOpen() {
    return this._modal.isOpen();
  }

  /** Open the modal and focus the search input. */
  open() {
    this._modal.open();
    // Override ModalDialog's default focus (close button) → focus search input
    this._searchInput.value = this._query;
    this._searchInput.focus();
  }

  /** Close the modal. Safe to call multiple times. */
  close() {
    this._modal.close();
  }

  /** Destroy the modal and clean up. */
  destroy() {
    this._modal.destroy();
  }

  // ── Private ──

  /**
   * Handle keydown events scoped to the picker content.
   * @param {KeyboardEvent} e
   */
  _handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (this._filteredItems.length > 0) {
        const next = Math.min(this._selectedIndex + 1, this._filteredItems.length - 1);
        this._selectIndex(next);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (this._filteredItems.length > 0) {
        const prev = Math.max(this._selectedIndex - 1, 0);
        this._selectIndex(prev);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      this._confirm();
    }
  }

  /**
   * Single entry point for confirmation. Guards against invalid state.
   * Called by Enter key, double-click, and confirm button.
   */
  _confirm() {
    if (!this._modal.isOpen()) return;
    if (this._selectedIndex < 0 || this._selectedIndex >= this._filteredItems.length) return;

    const item = this._filteredItems[this._selectedIndex];
    if (this._onConfirm) this._onConfirm(item);
    this.close();
  }

  /** Run substring filter and rebuild the list. */
  _filter() {
    const q = this._query.toLowerCase().trim();

    // Remember current selection for preservation
    const prevItem = (this._selectedIndex >= 0 && this._selectedIndex < this._filteredItems.length)
      ? this._filteredItems[this._selectedIndex]
      : null;

    // Filter
    if (q === "") {
      this._filteredItems = this._items.slice();
    } else {
      this._filteredItems = this._items.filter((item) => {
        const text = this._getSearchTextFor(item).toLowerCase();
        return text.includes(q);
      });
    }

    // Preserve selection with cascading fallback
    let newIndex = -1;
    if (prevItem && this._filteredItems.length > 0) {
      // 1. By reference
      newIndex = this._filteredItems.indexOf(prevItem);
      // 2. By id
      if (newIndex < 0 && prevItem.id != null) {
        newIndex = this._filteredItems.findIndex((it) => it.id != null && it.id === prevItem.id);
      }
    }
    // 3. Initial selectedId (first render only)
    if (newIndex < 0 && this._initialSelectedId != null && this._filteredItems.length > 0) {
      const initId = this._initialSelectedId;
      this._initialSelectedId = null;
      newIndex = this._filteredItems.findIndex((it) => it.id != null && it.id === initId);
    }
    // 4. Fall back to first result
    if (newIndex < 0 && this._filteredItems.length > 0) {
      newIndex = 0;
    }

    this._selectedIndex = newIndex;
    this._renderList();
  }

  /**
   * Get searchable text for an item.
   * @param {object} item
   * @returns {string}
   */
  _getSearchTextFor(item) {
    if (this._getSearchText) return this._getSearchText(item);
    // Default: concatenate common fields
    const parts = [];
    if (item.title) parts.push(item.title);
    if (item.subtitle) parts.push(item.subtitle);
    if (item.id) parts.push(item.id);
    if (item.meta) parts.push(item.meta);
    return parts.join(" ");
  }

  /** Rebuild the list DOM from _filteredItems. */
  _renderList() {
    const list = this._listEl;
    list.innerHTML = "";

    const hasResults = this._filteredItems.length > 0;
    this._emptyEl.style.display = hasResults ? "none" : "";
    this._confirmBtn.disabled = !hasResults || this._selectedIndex < 0;

    for (let i = 0; i < this._filteredItems.length; i++) {
      const item = this._filteredItems[i];
      const selected = i === this._selectedIndex;

      let rowEl;
      if (this._renderItem) {
        rowEl = this._renderItem(item, { selected, query: this._query });
      } else {
        rowEl = this._renderDefaultRow(item);
      }

      rowEl.classList.add("search-list-row");
      if (selected) rowEl.classList.add("is-selected");

      // Mouse: click → select, double-click → confirm
      rowEl.addEventListener("click", () => {
        this._selectIndex(i);
      });
      rowEl.addEventListener("dblclick", () => {
        this._selectIndex(i);
        this._confirm();
      });

      list.appendChild(rowEl);
    }

    // Scroll selected into view
    if (this._selectedIndex >= 0) {
      this._scrollSelectedIntoView();
    }
  }

  /**
   * Build the default row element for an item.
   * Layout: left column (title + subtitle), right column (meta).
   * @param {object} item
   * @returns {HTMLElement}
   */
  _renderDefaultRow(item) {
    const row = document.createElement("div");
    row.className = "search-list-row-inner";

    const left = document.createElement("div");
    left.className = "search-list-row-left";

    const titleEl = document.createElement("div");
    titleEl.className = "search-list-row-title";
    titleEl.textContent = item.title || item.id || "";
    left.appendChild(titleEl);

    if (item.subtitle) {
      const subEl = document.createElement("div");
      subEl.className = "search-list-row-subtitle";
      subEl.textContent = item.subtitle;
      left.appendChild(subEl);
    }

    row.appendChild(left);

    if (item.meta) {
      const metaEl = document.createElement("div");
      metaEl.className = "search-list-row-meta";
      metaEl.textContent = item.meta;
      row.appendChild(metaEl);
    }

    return row;
  }

  /**
   * Update selection to a specific index. Toggles CSS classes and scrolls into view.
   * @param {number} index
   */
  _selectIndex(index) {
    if (index < 0 || index >= this._filteredItems.length) return;

    // Remove old selection
    const rows = this._listEl.children;
    if (this._selectedIndex >= 0 && this._selectedIndex < rows.length) {
      rows[this._selectedIndex].classList.remove("is-selected");
    }

    this._selectedIndex = index;

    // Add new selection
    if (index < rows.length) {
      rows[index].classList.add("is-selected");
    }

    this._confirmBtn.disabled = false;
    this._scrollSelectedIntoView();
  }

  /** Ensure the selected row is visible inside the scrollable list. */
  _scrollSelectedIntoView() {
    const rows = this._listEl.children;
    if (this._selectedIndex >= 0 && this._selectedIndex < rows.length) {
      rows[this._selectedIndex].scrollIntoView({ block: "nearest" });
    }
  }
}
