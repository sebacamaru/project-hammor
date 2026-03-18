export class PanTool {
  constructor(state) {
    this.state = state;
    this.isDragging = false;
    this.lastScreenX = 0;
    this.lastScreenY = 0;
  }

  pointerDown(ctx) {
    this.isDragging = true;
    this.lastScreenX = ctx.screenX;
    this.lastScreenY = ctx.screenY;
    this._viewportScale = ctx.viewportScale || 1;
  }

  pointerMove(ctx) {
    if (!this.isDragging) return;

    const dx = ctx.screenX - this.lastScreenX;
    const dy = ctx.screenY - this.lastScreenY;

    this.lastScreenX = ctx.screenX;
    this.lastScreenY = ctx.screenY;

    const scale = this._viewportScale;
    this.state.update((s) => {
      s.camera.x -= dx / scale;
      s.camera.y -= dy / scale;
    });
  }

  pointerUp() {
    this.isDragging = false;
  }
}
