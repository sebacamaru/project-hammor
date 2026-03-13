export class SceneManager {
  constructor(engine) {
    this.engine = engine;
    this.stack = [];
  }

  get current() {
    return this.stack[this.stack.length - 1] ?? null;
  }

  goto(scene) {
    this.current?.exit();
    this.current?.destroy();
    this.stack.length = 0;
    this.stack.push(scene);
    scene.enter(this.engine);
  }

  push(scene) {
    this.current?.pause?.();
    this.stack.push(scene);
    scene.enter(this.engine);
  }

  pop() {
    const old = this.stack.pop();
    old?.exit();
    old?.destroy();
    this.current?.resume?.();
  }

  update(dt) {
    this.current?.update(dt);
  }

  render(alpha) {
    this.current?.render(alpha);
  }
}
