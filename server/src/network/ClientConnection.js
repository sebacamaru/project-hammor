import WebSocket from "ws";

export class ClientConnection {
  constructor(id, socket) {
    this.id = id;
    this.socket = socket;
  }

  get isOpen() {
    return this.socket.readyState === WebSocket.OPEN;
  }

  send(message) {
    if (!this.isOpen) return;

    try {
      this.socket.send(JSON.stringify(message));
    } catch (err) {
      console.warn(`[ClientConnection] Send failed for ${this.id}:`, err.message);
    }
  }

  close() {
    this.socket.close();
  }
}
