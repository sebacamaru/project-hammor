/**
 * Client-side WebSocket manager.
 * Connects to the game server, sends hello/input, receives welcome/snapshot.
 * Minimal: no reconnection, no retries, no queuing.
 */
export class NetworkManager {
  /**
   * @param {string} url - WebSocket server URL (e.g. "ws://127.0.0.1:3001").
   */
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.seq = 0;

    /** @type {function|null} Called with welcome message payload. */
    this.onWelcome = null;
    /** @type {function|null} Called with snapshot message payload. */
    this.onSnapshot = null;
    /** @type {function|null} Called with interact_result message payload. */
    this.onInteractResult = null;
    /** @type {function|null} Called with event_message payload (server-driven event). */
    this.onEventMessage = null;
    /** @type {function|null} Called when server-driven event ends. */
    this.onEventEnd = null;
    /** @type {function|null} Called with granular input lock state during server-driven events. */
    this.onEventInputLock = null;
  }

  /**
   * Opens the WebSocket connection and sends a hello message on open.
   */
  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log("[NetworkManager] Connected");
      this.send({ type: "hello", name: "client" });
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "welcome":
          this.onWelcome?.(msg);
          break;
        case "snapshot":
          this.onSnapshot?.(msg);
          break;
        case "interact_result":
          this.onInteractResult?.(msg);
          break;
        case "event_message":
          this.onEventMessage?.(msg);
          break;
        case "event_end":
          this.onEventEnd?.(msg);
          break;
        case "event_input_lock":
          this.onEventInputLock?.(msg);
          break;
      }
    };

    this.ws.onclose = () => {
      console.log("[NetworkManager] Disconnected");
    };

    this.ws.onerror = (err) => {
      console.warn("[NetworkManager] Error:", err);
    };
  }

  /**
   * Sends an input message with the current seq number.
   * @param {{ up: boolean, down: boolean, left: boolean, right: boolean }} input
   */
  /**
   * Sends an input message with the current seq number.
   * @param {{ up: boolean, down: boolean, left: boolean, right: boolean }} input
   * @returns {number} The seq number used for this input.
   */
  sendInput(input) {
    const seq = this.seq++;
    this.send({ type: "input", seq, input });
    return seq;
  }

  /**
   * Sends a JSON message if the socket is open.
   * @param {object} obj
   */
  send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  /**
   * Closes the WebSocket connection.
   */
  disconnect() {
    this.ws?.close();
  }
}
