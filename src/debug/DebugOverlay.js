import { Container, Text } from "pixi.js";

export class DebugOverlay {
  constructor(stage) {
    this.container = new Container();
    this.container.zIndex = 9999;
    this.visible = false;
    this.container.visible = false;

    this.text = new Text({
      text: "",
      style: {
        fontFamily: "monospace",
        fontSize: 10,
        fill: 0x00ff00,
        stroke: { color: 0x000000, width: 2 },
      },
    });
    this.text.x = 4;
    this.text.y = 4;
    this.container.addChild(this.text);
    stage.addChild(this.container);

    this.frames = 0;
    this.elapsed = 0;
    this.fps = 0;
    this.info = {};
  }

  toggle() {
    this.visible = !this.visible;
    this.container.visible = this.visible;
  }

  set(key, value) {
    this.info[key] = value;
  }

  update(frameDelta) {
    this.frames++;
    this.elapsed += frameDelta;
    if (this.elapsed >= 1000) {
      this.fps = this.frames;
      this.frames = 0;
      this.elapsed -= 1000;
    }

    if (!this.visible) return;

    let lines = [`FPS: ${this.fps}`];
    for (const [k, v] of Object.entries(this.info)) {
      lines.push(`${k}: ${v}`);
    }
    this.text.text = lines.join("\n");
  }
}
