import { TILESET_CONFIG } from "../TilesetConfig.js";

const TILE_DISPLAY_SIZE = 32; // 16px tiles rendered at 2x in the panel

export class TilesPanel {
  constructor(el, state) {
    this.el = el;
    this.state = state;
    this.currentGroupId = TILESET_CONFIG.groups[0]?.id ?? null;

    this.render();
    this.renderGroup(this.currentGroupId);
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
    for (const group of TILESET_CONFIG.groups) {
      const opt = document.createElement("option");
      opt.value = group.id;
      opt.textContent = group.name;
      select.appendChild(opt);
    }

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

    const group = TILESET_CONFIG.groups.find((g) => g.id === groupId);
    if (!group) {
      grid.innerHTML = "";
      return;
    }

    const { image, tileSize, columns } = TILESET_CONFIG;
    const scale = TILE_DISPLAY_SIZE / tileSize;
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
    const cells = this.el.querySelectorAll(".tile-cell");
    for (const cell of cells) {
      const id = Number(cell.dataset.tileId);
      cell.classList.toggle("is-selected", id === s.selectedTileId);
    }
  }

  destroy() {
    this.unsubscribe?.();
  }
}
