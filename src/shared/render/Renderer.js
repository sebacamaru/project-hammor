import { Application, TextureSource } from "pixi.js";
import { ViewportState } from "./ViewportState.js";
import { computeViewport } from "./ResolutionManager.js";

export class Renderer {
  constructor(rootElement) {
    this.rootElement = rootElement;
    this.app = null;
    this.canvas = null;
    this.stage = null;
    this.viewport = new ViewportState();
  }

  async init() {
    TextureSource.defaultOptions.scaleMode = "nearest";

    // Compute initial viewport from container size
    computeViewport(
      this.rootElement.clientWidth,
      this.rootElement.clientHeight,
      this.viewport,
    );

    this.app = new Application();

    await this.app.init({
      width: this.viewport.widthPx,
      height: this.viewport.heightPx,
      background: "#000000",
      antialias: false,
      roundPixels: true,
      resolution: 1,
      preference: "webgl",
    });

    this.canvas = this.app.canvas;
    this.stage = this.app.stage;

    this.rootElement.appendChild(this.canvas);

    this.setupCanvasStyle();
    this.applyViewport();
    window.addEventListener("resize", () => this.resize());
  }

  setupCanvasStyle() {
    this.canvas.style.display = "block";
    this.canvas.style.imageRendering = "pixelated";
    this.canvas.style.position = "absolute";
  }

  resize() {
    computeViewport(
      this.rootElement.clientWidth,
      this.rootElement.clientHeight,
      this.viewport,
    );

    // Resize Pixi's internal rendering surface
    this.app.renderer.resize(this.viewport.widthPx, this.viewport.heightPx);

    this.applyViewport();
  }

  applyViewport() {
    const vp = this.viewport;
    this.canvas.style.width = `${vp.cssWidth}px`;
    this.canvas.style.height = `${vp.cssHeight}px`;
    this.canvas.style.left = `${vp.offsetX}px`;
    this.canvas.style.top = `${vp.offsetY}px`;
  }
}
