import WebSocket from "ws";

/**
 * Wraps an individual WebSocket connection.
 * Handles JSON serialization for outgoing messages.
 * Does not know about gameplay — purely transport-level.
 */
export class ClientConnection {
  /**
   * @param {string} id - Unique connection id (e.g. "c1").
   * @param {WebSocket} socket - The underlying WebSocket instance.
   */
  constructor(id, socket) {
    this.id = id;
    this.socket = socket;
  }

  /** @returns {boolean} Whether the socket is in OPEN state. */
  get isOpen() {
    return this.socket.readyState === WebSocket.OPEN;
  }

  /**
   * Sends a message object as JSON. Silently skips if socket is closed.
   * @param {object} message - The message to serialize and send.
   */
  send(message) {
    if (!this.isOpen) return;

    try {
      this.socket.send(JSON.stringify(message));
    } catch (err) {
      console.warn(`[ClientConnection] Send failed for ${this.id}:`, err.message);
    }
  }

  /** Closes the underlying socket. */
  close() {
    this.socket.close();
  }
}
