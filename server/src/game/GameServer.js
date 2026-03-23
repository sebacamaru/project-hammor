import { ServerLoop } from "./ServerLoop.js";
import { NetworkServer } from "../network/NetworkServer.js";
import {
  createMessage,
  validateInput,
  MSG_TYPES,
} from "../network/protocols/messages.js";
import { SessionManager } from "./SessionManager.js";
import { ServerPlayer } from "./entities/ServerPlayer.js";
import { MovementSystem } from "./systems/MovementSystem.js";
import { CollisionSystem } from "./systems/CollisionSystem.js";
import { RuntimeMapManager } from "../runtime/RuntimeMapManager.js";
import { AOI_RADIUS_SQ } from "../../../src/shared/core/Config.js";

/**
 * Central game server orchestrator.
 * Owns the tick loop, networking, sessions, players, movement, and runtime maps.
 * Coordinates everything but delegates specifics to subsystems.
 */
export class GameServer {
  /**
   * @param {object} config - Server configuration from createServerConfig().
   */
  constructor(config) {
    if (!config || !config.tickMs) {
      throw new Error("Invalid ServerConfig: tickMs is required");
    }

    this.config = config;
    this.tickCount = 0;

    this.loop = new ServerLoop({
      tickMs: config.tickMs,
      onTick: (dt) => this.update(dt),
    });

    this.network = new NetworkServer({
      host: config.host,
      port: config.port,
    });

    this.network.onConnection = (conn) => this.handleConnection(conn);
    this.network.onMessage = (conn, msg) => this.handleMessage(conn, msg);
    this.network.onDisconnect = (conn) => this.handleDisconnect(conn);

    this.sessions = new SessionManager();
    /** @type {Map<string, ServerPlayer>} playerId → ServerPlayer */
    this.players = new Map();
    this.nextPlayerId = 1;
    this.movementSystem = new MovementSystem();
    this.collisionSystem = new CollisionSystem();
    this.runtimeMaps = new RuntimeMapManager();
  }

  /**
   * Starts the server: loads runtime map, opens WebSocket, starts tick loop.
   * If map loading fails, nothing else starts.
   */
  async start() {
    const map = await this.runtimeMaps.loadMap(this.config.startMapId);
    console.log(
      `[${this.config.serverName}] Loaded map ${map.id} (${map.width}x${map.height})`,
    );

    await this.network.start();
    console.log(
      `[${this.config.serverName}] WebSocket listening on ${this.config.host}:${this.config.port}`,
    );

    this.loop.start();
    console.log(
      `[${this.config.serverName}] Started at ${this.config.tickRate} TPS`,
    );
  }

  /**
   * Stops the server: halts tick loop, then closes all connections and the WebSocket server.
   */
  async stop() {
    this.loop.stop();
    await this.network.stop();
    console.log(
      `[${this.config.serverName}] Stopped (${this.tickCount} ticks elapsed)`,
    );
  }

  /**
   * Main simulation tick. Runs movement for all players and periodic debug logging.
   * @param {number} dt - Tick duration in milliseconds.
   */
  update(dt) {
    this.tickCount++;
    this.movementSystem.update(this.players, dt, this.config, this.runtimeMaps, this.collisionSystem);

    if (this.tickCount % this.config.snapshotInterval === 0) {
      this.broadcastSnapshots();
    }

    if (this.tickCount > 0 && this.tickCount % 20 === 0) {
      const tag = `[${this.config.serverName}]`;
      console.log(`${tag} Tick ${this.tickCount}`);
      for (const player of this.players.values()) {
        console.log(
          `${tag}   ${player.id} pos=(${player.x.toFixed(2)}, ${player.y.toFixed(2)}) vel=(${player.vx.toFixed(2)}, ${player.vy.toFixed(2)}) facing=${player.facing}`,
        );
      }
    }
  }

  /** Called when a new WebSocket connection is established. */
  handleConnection(conn) {
    console.log(`[${this.config.serverName}] Client connected: ${conn.id}`);
  }

  /**
   * Called when a client disconnects. Cleans up session and player.
   * Removes session first (cuts logical relation), then removes player entity.
   */
  handleDisconnect(conn) {
    const session = this.sessions.getByConnection(conn.id);
    if (!session) {
      console.log(
        `[${this.config.serverName}] Client disconnected: ${conn.id} (no session)`,
      );
      return;
    }

    this.sessions.remove(session.id);
    this.players.delete(session.playerId);

    console.log(
      `[${this.config.serverName}] Client disconnected: ${conn.id} — session ${session.id}, player ${session.playerId} removed`,
    );
  }

  /**
   * Routes incoming messages by type.
   * HELLO: creates session + player, sends welcome (or resends if duplicate).
   * INPUT: validates and applies input to the player's state.
   */
  handleMessage(conn, msg) {
    switch (msg.type) {
      case MSG_TYPES.HELLO: {
        // Duplicate hello → resend existing welcome without creating new session
        const existing = this.sessions.getByConnection(conn.id);
        if (existing) {
          const player = this.players.get(existing.playerId);
          conn.send(this.buildWelcome(conn, existing, player));
          return;
        }

        const playerId = `p${this.nextPlayerId++}`;
        const player = new ServerPlayer(
          playerId,
          this.config.startMapId,
          this.config.spawnX,
          this.config.spawnY,
        );
        this.players.set(playerId, player);

        const session = this.sessions.create(conn.id, playerId);

        conn.send(this.buildWelcome(conn, session, player));

        console.log(
          `[${this.config.serverName}] Session ${session.id} created — player ${playerId} spawned in ${player.mapId} at (${player.x}, ${player.y})`,
        );
        break;
      }

      case MSG_TYPES.INPUT: {
        const session = this.sessions.getByConnection(conn.id);
        if (!session) {
          console.warn(
            `[${this.config.serverName}] Input from ${conn.id} without session`,
          );
          return;
        }

        const validation = validateInput(msg);
        if (!validation.ok) {
          console.warn(
            `[${this.config.serverName}] Invalid input from ${conn.id}: ${validation.error}`,
          );
          return;
        }

        const player = this.players.get(session.playerId);
        if (!player) {
          console.warn(
            `[${this.config.serverName}] No player for session ${session.id}`,
          );
          return;
        }

        // Ignore stale or duplicate inputs
        if (msg.seq <= player.input.seq) return;

        player.input.apply(msg.seq, msg.input);
        player.lastProcessedSeq = msg.seq;
        break;
      }

      default:
        conn.send(
          createMessage(MSG_TYPES.ERROR, {
            message: `Unknown message type: ${msg.type}`,
          }),
        );
        break;
    }
  }

  /**
   * Sends an AOI-filtered snapshot to each connected session.
   * Each client receives only: itself (always first) + nearby players on the same map.
   * Proximity is checked via squared distance against AOI_RADIUS_SQ.
   */
  broadcastSnapshots() {
    for (const session of this.sessions.getAll()) {
      const conn = this.network.getConnection(session.connectionId);
      if (!conn) continue;

      const selfPlayer = this.players.get(session.playerId);
      if (!selfPlayer) continue;

      // Self always first
      const visiblePlayers = [selfPlayer.toData()];

      for (const other of this.players.values()) {
        if (other.id === selfPlayer.id) continue;
        if (other.mapId !== selfPlayer.mapId) continue;

        const dx = other.x - selfPlayer.x;
        const dy = other.y - selfPlayer.y;
        if (dx * dx + dy * dy <= AOI_RADIUS_SQ) {
          visiblePlayers.push(other.toData());
        }
      }

      conn.send(createMessage(MSG_TYPES.SNAPSHOT, {
        tick: this.tickCount,
        lastProcessedSeq: selfPlayer.lastProcessedSeq,
        players: visiblePlayers,
      }));
    }
  }

  /**
   * Builds a welcome message for a client. Used for both new and repeated hello.
   * @param {ClientConnection} conn
   * @param {object} session
   * @param {ServerPlayer} player
   * @returns {object} The welcome message object.
   */
  buildWelcome(conn, session, player) {
    return createMessage(MSG_TYPES.WELCOME, {
      connectionId: conn.id,
      sessionId: session.id,
      player: player.toData(),
    });
  }
}
