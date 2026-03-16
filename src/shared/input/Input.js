export class Input {
  constructor() {
    this._keys = new Set();
    this._keysDown = new Set();
    this._keysUp = new Set();
    this._prev = new Set();

    window.addEventListener("keydown", (e) => {
      this._keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => {
      this._keys.delete(e.code);
    });
  }

  poll() {
    this._keysDown.clear();
    this._keysUp.clear();
    for (const k of this._keys) {
      if (!this._prev.has(k)) this._keysDown.add(k);
    }
    for (const k of this._prev) {
      if (!this._keys.has(k)) this._keysUp.add(k);
    }
    this._prev = new Set(this._keys);
  }

  held(code) {
    return this._keys.has(code);
  }

  pressed(code) {
    return this._keysDown.has(code);
  }

  released(code) {
    return this._keysUp.has(code);
  }
}
