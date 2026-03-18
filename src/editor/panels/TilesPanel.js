export class TilesPanel {
  constructor(el, state) {
    this.el = el;
    this.state = state;

    this.render();
  }

  render() {
    this.el.innerHTML = `
      <div class="panel-title">Tiles</div>
      <div class="tiles-grid">
        <!-- tiles se renderizan acá -->
      </div>
    `;
  }
}
