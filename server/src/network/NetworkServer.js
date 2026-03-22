import { WebSocketServer } from "ws";
import { ClientConnection } from "./ClientConnection.js";
import { parseMessage } from "./protocols/messages.js";

/**
 * WebSocket server that accepts client connections.
 * Parses incoming JSON messages and delegates to callbacks.
 * Does not contain any game logic — purely networking.
 *
 * Callbacks (set by GameServer):
 *   onConnection(conn)        — new client connected
 *   onMessage(conn, message)  — valid JSON message received
 *   onDisconnect(conn)        — client disconnected (not called during shutdown)
 */
export class NetworkServer {
  /**
   * @param {object} options
   * @param {string} options.host - Bind address (e.g. "127.0.0.1").
   * @param {number} options.port - Listen port.
   */
  constructor({ host, port }) {
    this.host = host;
    this.port = port;
    this.wss = null;
    /** @type {Map<string, ClientConnection>} */
    this.connections = new Map();
    this.nextId = 1;
    this.stopping = false;

    this.onConnection = null;
    this.onMessage = null;
    this.onDisconnect = null;
  }

  /**
   * Starts the WebSocket server and begins accepting connections.
   * Resolves when the server is listening.
   */
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

  /**
   * Returns a connection by its id, or undefined if not found.
   * @param {string} connId
   * @returns {ClientConnection|undefined}
   */
  getConnection(connId) {
    return this.connections.get(connId);
  }

  /**
   * Graceful shutdown: marks stopping, closes all connections, then closes the server.
   * Skips onDisconnect callbacks during shutdown to avoid spurious events.
   */
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
