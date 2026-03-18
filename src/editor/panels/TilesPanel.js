const TILE_DISPLAY_SIZE = 32; // 16px tiles rendered at 2x in the panel

export class TilesPanel {
  constructor(el, state) {
    this.el = el;
    this.state = state;
    this.currentGroupId = null;
    this.tilesetId = null;

    this.render();
    this.unsubscribe = this.state.subscribe(() => this.sync());
    this.sync();
  }

  render() {
    this.el.innerHTML = `
      <div class="panel-section tiles-panel">
        <div class="panel-title">Tiles</div>
        <select class="tiles-group-select"></select>
        <div class="tiles-grid"></div>
      </div>
    `;

    // Populate group dropdown
    const select = this.el.querySelector(".tiles-group-select");
    select.disabled = true;

    // Group change
    select.addEventListener("change", (e) => {
      this.currentGroupId = e.target.value;
      this.renderGroup(this.currentGroupId);
      this.sync();
    });

    // Tile click (delegated)
    this.el.querySelector(".tiles-grid").addEventListener("click", (e) => {
      const cell = e.target.closest("[data-tile-id]");
      if (!cell) return;

      const tileId = Number(cell.dataset.tileId);
      this.state.patch({
        selectedTileId: tileId,
        selectedBrush: { width: 1, height: 1, tiles: [tileId] },
        activeTool: "pencil",
      });
    });
  }

  renderGroup(groupId) {
    const grid = this.el.querySelector(".tiles-grid");
    if (!grid) return;

    const tileset = this.getTileset();
    const groups = this.getGroups();
    const group = groups.find((g) => g.id === groupId);
    if (!group) {
      grid.innerHTML = "";
      return;
    }

    const { image, tileSize, columns } = tileset;
    let html = "";

    for (let i = 0; i < group.count; i++) {
      const tileId = group.startId + i;
      const atlasX = tileId % columns;
      const atlasY = Math.floor(tileId / columns);
      const bgX = -(atlasX * TILE_DISPLAY_SIZE);
      const bgY = -(atlasY * TILE_DISPLAY_SIZE);
      // Atlas is columns*tileSize wide, rows*tileSize tall — scale it to match display size
      const bgSize = columns * TILE_DISPLAY_SIZE;

      html += `<div
        class="tile-cell"
        data-tile-id="${tileId}"
        title="Tile ${tileId}"
        style="
          width: ${TILE_DISPLAY_SIZE}px;
          height: ${TILE_DISPLAY_SIZE}px;
          background-image: url('${image}');
          background-position: ${bgX}px ${bgY}px;
          background-size: ${bgSize}px;
        "
      ></div>`;
    }

    grid.innerHTML = html;
  }

  sync() {
    const s = this.state.get();
    this.syncTilesetUi();

    const cells = this.el.querySelectorAll(".tile-cell");
    for (const cell of cells) {
      const id = Number(cell.dataset.tileId);
      cell.classList.toggle("is-selected", id === s.selectedTileId);
    }
  }

  syncTilesetUi() {
    const tileset = this.getTileset();
    const nextTilesetId = tileset?.id ?? null;

    if (nextTilesetId !== this.tilesetId) {
      this.tilesetId = nextTilesetId;
      this.rebuildGroupOptions();
    }

    const groups = this.getGroups();
    const hasCurrentGroup = groups.some((group) => group.id === this.currentGroupId);
    if (!hasCurrentGroup) {
      this.currentGroupId = groups[0]?.id ?? null;
      this.rebuildGroupOptions();
    }

    this.renderGroup(this.currentGroupId);
  }

  rebuildGroupOptions() {
    const select = this.el.querySelector(".tiles-group-select");
    if (!select) return;

    const groups = this.getGroups();
    select.innerHTML = "";

    for (const group of groups) {
      const opt = document.createElement("option");
      opt.value = group.id;
      opt.textContent = group.name;
      opt.selected = group.id === this.currentGroupId;
      select.appendChild(opt);
    }

    select.disabled = groups.length === 0;
    select.value = this.currentGroupId ?? "";
  }

  getTileset() {
    return this.state.get().map?.tileset ?? null;
  }

  getGroups() {
    return this.getTileset()?.editor?.groups ?? [];
  }

  destroy() {
    this.unsubscribe?.();
  }
}
