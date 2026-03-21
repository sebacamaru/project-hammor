import { WebSocketServer } from "ws";
import { ClientConnection } from "./ClientConnection.js";
import { parseMessage } from "./protocols/messages.js";

export class NetworkServer {
  constructor({ host, port }) {
    this.host = host;
    this.port = port;
    this.wss = null;
    this.connections = new Map();
    this.nextId = 1;
    this.stopping = false;

    this.onConnection = null;
    this.onMessage = null;
    this.onDisconnect = null;
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ host: this.host, port: this.port });

      this.wss.on("listening", () => resolve());
      this.wss.on("error", (err) => reject(err));

      this.wss.on("connection", (socket) => {
        const id = `c${this.nextId++}`;
        const conn = new ClientConnection(id, socket);
        this.connections.set(id, conn);

        if (this.onConnection) this.onConnection(conn);

        socket.on("message", (raw) => {
          const result = parseMessage(raw);

          if (!result.ok) {
            console.warn(`[NetworkServer] Bad message from ${id}: ${result.error}`);
            return;
          }

          if (this.onMessage) this.onMessage(conn, result.message);
        });

        socket.on("close", () => {
          this.connections.delete(id);
          if (!this.stopping && this.onDisconnect) this.onDisconnect(conn);
        });

        socket.on("error", (err) => {
          console.warn(`[NetworkServer] Socket error from ${id}:`, err.message);
        });
      });
    });
  }

  async stop() {
    this.stopping = true;

    for (const conn of this.connections.values()) {
      conn.close();
    }
    this.connections.clear();

    return new Promise((resolve) => {
      if (!this.wss) return resolve();
      this.wss.close(() => resolve());
    });
  }
}
