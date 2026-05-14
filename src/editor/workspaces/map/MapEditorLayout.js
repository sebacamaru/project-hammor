export class MapEditorLayout {
  constructor(root) {
    this.root = root;

    this.root.innerHTML = `
      <div class="editor-viewport">
        <div class="editor-viewport-canvas"></div>
      </div>
      <div class="editor-shell">
        <div class="wrapper">
          <aside class="editor-panel editor-panel-left"></aside>
          <div class="layer-vis-panel-host"></div>
          <aside class="editor-panel editor-panel-events"></aside>
          <aside class="editor-panel editor-panel-lights"></aside>
          <aside class="editor-panel editor-panel-commands"></aside>
          <footer class="editor-statusbar"></footer>
        </div>
      </div>
    `;

    this.viewportEl = this.root.querySelector(".editor-viewport-canvas");
    this.leftPanelEl = this.root.querySelector(".editor-panel-left");
    this.layersPanelEl = this.root.querySelector(".layer-vis-panel-host");
    this.eventsPanelEl = this.root.querySelector(".editor-panel-events");
    this.eventsPanelEl.style.display = "none";
    this.lightsPanelEl = this.root.querySelector(".editor-panel-lights");
    this.lightsPanelEl.style.display = "none";
    this.commandsPanelEl = this.root.querySelector(".editor-panel-commands");
    this.commandsPanelEl.style.display = "none";
    this.statusBarEl = this.root.querySelector(".editor-statusbar");
  }
}
