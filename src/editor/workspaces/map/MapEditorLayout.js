export class MapEditorLayout {
  constructor(root) {
    this.root = root;

    this.root.innerHTML = `
      <div class="editor-viewport">
        <div class="editor-viewport-canvas"></div>
      </div>
      <div class="editor-shell">
        <div class="wrapper">
          <header class="editor-toolbar"></header>
          <aside class="editor-panel editor-panel-left"></aside>
          <aside class="editor-panel editor-panel-right"></aside>
          <div class="editor-tools"></div>
          <footer class="editor-statusbar"></footer>
        </div>
      </div>
    `;

    this.viewportEl = this.root.querySelector(".editor-viewport-canvas");
    this.toolbarEl = this.root.querySelector(".editor-toolbar");
    this.leftPanelEl = this.root.querySelector(".editor-panel-left");
    this.rightPanelEl = this.root.querySelector(".editor-panel-right");
    this.toolsEl = this.root.querySelector(".editor-tools");
    this.statusBarEl = this.root.querySelector(".editor-statusbar");
  }
}
