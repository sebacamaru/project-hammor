export class WorldEditorApp {
  constructor() {
    this.host = null;
  }

  async mount(host) {
    this.host = host;
    this.host.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        color: rgba(255, 255, 255, 0.4);
        font-size: 18px;
      ">
        World Editor — Coming soon
      </div>
    `;
  }

  unmount() {
    if (this.host) {
      this.host.innerHTML = "";
      this.host = null;
    }
  }

  resize(width, height) {}
  update(dt) {}
  async save() {}
  canSave() { return false; }
  getTitle() { return "World"; }
}
