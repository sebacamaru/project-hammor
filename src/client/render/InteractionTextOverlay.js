import { Container, Graphics, Text } from "pixi.js";

const AUTO_HIDE_MS = 3000;
const PADDING_X = 12;
const PADDING_Y = 8;
const MARGIN_BOTTOM = 24;
const BG_COLOR = 0x000000;
const BG_ALPHA = 0.75;
const TEXT_COLOR = 0xffffff;
const FONT_SIZE = 10;

/**
 * Minimal screen-space text overlay for interaction results.
 * Shows text at the bottom-center of the screen and auto-hides after a timer.
 * Replaces previous text on each show() call (never accumulates).
 * Added to the stage directly (screen-space), not the world root.
 */
export class InteractionTextOverlay {
  /**
   * @param {import("pixi.js").Container} stage - The renderer stage (screen-space parent).
   * @param {import("../../shared/render/ViewportState.js").ViewportState} viewport - For screen dimensions.
   */
  constructor(stage, viewport) {
    this.stage = stage;
    this.viewport = viewport;

    this.container = new Container();
    this.container.zIndex = 9000;
    this.container.visible = false;

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.textObj = new Text({
      text: "",
      style: {
        fontFamily: "monospace",
        fontSize: FONT_SIZE,
        fill: TEXT_COLOR,
        wordWrap: true,
        wordWrapWidth: 300,
      },
    });
    this.container.addChild(this.textObj);

    this.stage.addChild(this.container);

    /** @type {number|null} */
    this._hideTimer = null;
    this._timerStart = 0;
  }

  /**
   * Shows text in the overlay, replacing any previous content.
   * Starts auto-hide timer.
   * @param {string} text
   */
  show(text) {
    this.textObj.text = text;

    // Redraw background to fit text
    const tw = this.textObj.width;
    const th = this.textObj.height;
    this.bg.clear();
    this.bg.roundRect(0, 0, tw + PADDING_X * 2, th + PADDING_Y * 2, 4);
    this.bg.fill({ color: BG_COLOR, alpha: BG_ALPHA });

    this.textObj.x = PADDING_X;
    this.textObj.y = PADDING_Y;

    // Position at bottom-center of screen
    const boxW = tw + PADDING_X * 2;
    const boxH = th + PADDING_Y * 2;
    this.container.x = Math.round((this.viewport.cssWidth / this.viewport.scale - boxW) / 2);
    this.container.y = Math.round(this.viewport.cssHeight / this.viewport.scale - boxH - MARGIN_BOTTOM);

    this.container.visible = true;
    this._timerStart = performance.now();
    this._hideTimer = AUTO_HIDE_MS;
  }

  /**
   * Hides the overlay immediately.
   */
  hide() {
    this.container.visible = false;
    this._hideTimer = null;
  }

  /**
   * Returns whether the overlay is currently visible.
   * @returns {boolean}
   */
  isVisible() {
    return this.container.visible;
  }

  /**
   * Checks auto-hide timer. Call from SceneMap.update().
   */
  update() {
    if (this._hideTimer !== null) {
      const elapsed = performance.now() - this._timerStart;
      if (elapsed >= this._hideTimer) {
        this.hide();
      }
    }
  }

  /**
   * Removes from stage and cleans up PixiJS objects.
   */
  destroy() {
    this.hide();
    if (this.container.parent) {
      this.container.parent.removeChild(this.container);
    }
    this.container.destroy({ children: true });
    this.container = null;
    this.textObj = null;
    this.bg = null;
  }
}
