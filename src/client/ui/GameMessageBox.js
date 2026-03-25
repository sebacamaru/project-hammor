const DISMISS_KEYS = new Set(["Enter", "Space"]);
const KEY_GUARD_MS = 120;
const TYPEWRITER_MS = 30;

/**
 * DOM-based message box for interaction text and future dialogue.
 * Promise-based API: show() resolves when the player dismisses the box.
 * Features typewriter text animation and a dismiss hint.
 * Never rejects. Idempotent dismiss(). Safe destroy() with pending promise resolution.
 */
export class GameMessageBox {
  /**
   * @param {HTMLElement} root - The GameUIRoot DOM element to mount into.
   */
  constructor(root) {
    // Build DOM structure
    this._container = document.createElement("div");
    this._container.className = "game-message-box-container";

    this._box = document.createElement("div");
    this._box.className = "game-message-box";

    this._speakerEl = document.createElement("div");
    this._speakerEl.className = "game-message-box-speaker";

    this._textEl = document.createElement("div");
    this._textEl.className = "game-message-box-text";

    this._hintEl = document.createElement("div");
    this._hintEl.className = "game-message-box-hint";
    this._hintEl.textContent = "[Enter] to continue";

    this._box.appendChild(this._speakerEl);
    this._box.appendChild(this._textEl);
    this._box.appendChild(this._hintEl);
    this._container.appendChild(this._box);
    root.appendChild(this._container);

    /** @type {(() => void)|null} */
    this._resolve = null;
    /** @type {Promise<void>|null} */
    this._promise = null;
    /** @type {number} */
    this._openedAt = 0;

    // Typewriter state
    this._fullText = "";
    this._charIndex = 0;
    this._typewriterTimer = null;

    // Bound handler for add/removeEventListener
    this._onKeyDown = this._handleKeyDown.bind(this);
  }

  /**
   * Shows the message box with the given text and optional speaker label.
   * Text appears with a typewriter animation. Pressing a dismiss key during
   * animation skips to the full text; pressing again dismisses the box.
   * Returns a Promise that resolves when the player dismisses the box.
   * If already open, returns the existing pending promise (no duplicate boxes).
   * Never rejects.
   * @param {{ text: string, speaker?: string|null }} options
   * @returns {Promise<void>}
   */
  show({ text, speaker = null }) {
    if (this._promise) return this._promise;

    if (speaker) {
      this._speakerEl.textContent = speaker;
      this._speakerEl.hidden = false;
    } else {
      this._speakerEl.textContent = "";
      this._speakerEl.hidden = true;
    }

    // Start typewriter
    this._fullText = text;
    this._charIndex = 0;
    this._textEl.textContent = "";
    this._hintEl.classList.remove("is-visible");
    this._startTypewriter();

    this._container.classList.add("is-open");
    this._openedAt = performance.now();

    window.addEventListener("keydown", this._onKeyDown);

    this._promise = new Promise((resolve) => {
      this._resolve = resolve;
    });
    return this._promise;
  }

  /**
   * Returns whether the message box is currently open.
   * @returns {boolean}
   */
  isOpen() {
    return this._promise !== null;
  }

  /**
   * Returns whether the typewriter animation is still running.
   * @returns {boolean}
   */
  isAnimating() {
    return this._typewriterTimer !== null;
  }

  /**
   * Hides the message box and resolves the pending promise.
   * Idempotent — no-op if not open.
   */
  dismiss() {
    if (!this._promise) return;

    this._stopTypewriter();
    this._container.classList.remove("is-open");
    window.removeEventListener("keydown", this._onKeyDown);

    const resolve = this._resolve;
    this._resolve = null;
    this._promise = null;
    resolve();
  }

  /**
   * Resolves any pending promise, removes listeners, and removes DOM nodes.
   */
  destroy() {
    this.dismiss();
    this._container.remove();
    this._container = null;
    this._box = null;
    this._speakerEl = null;
    this._textEl = null;
    this._hintEl = null;
  }

  /**
   * Skips the typewriter animation, showing the full text immediately.
   * Shows the dismiss hint. No-op if not animating.
   */
  skipAnimation() {
    this._stopTypewriter();
    this._textEl.textContent = this._fullText;
    this._hintEl.classList.add("is-visible");
  }

  /**
   * Starts the typewriter interval that reveals one character at a time.
   * @private
   */
  _startTypewriter() {
    this._typewriterTimer = setInterval(() => {
      this._charIndex++;
      this._textEl.textContent = this._fullText.slice(0, this._charIndex);
      if (this._charIndex >= this._fullText.length) {
        this._stopTypewriter();
        this._hintEl.classList.add("is-visible");
      }
    }, TYPEWRITER_MS);
  }

  /**
   * Stops the typewriter interval if running.
   * @private
   */
  _stopTypewriter() {
    if (this._typewriterTimer !== null) {
      clearInterval(this._typewriterTimer);
      this._typewriterTimer = null;
    }
  }

  /**
   * Handles keydown events while the message box is open.
   * If animating, first press skips to full text. Otherwise dismisses.
   * Ignores held keys (event.repeat) and keys pressed within the guard window.
   * @param {KeyboardEvent} e
   * @private
   */
  _handleKeyDown(e) {
    if (e.repeat) return;
    if (!DISMISS_KEYS.has(e.code)) return;
    if (performance.now() - this._openedAt < KEY_GUARD_MS) return;

    if (this.isAnimating()) {
      this.skipAnimation();
      return;
    }

    this.dismiss();
  }
}
