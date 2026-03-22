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
  sendInput(input) {
    this.send({ type: "input", seq: this.seq++, input });
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
