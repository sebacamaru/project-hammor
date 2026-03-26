import { ServerLoop } from "./ServerLoop.js";
import { NetworkServer } from "../network/NetworkServer.js";
import {
  createMessage,
  validateInput,
  validateInteract,
  MSG_TYPES,
} from "../network/protocols/messages.js";
import { SessionManager } from "./SessionManager.js";
import { ServerPlayer } from "./entities/ServerPlayer.js";
import { MovementSystem } from "./systems/MovementSystem.js";
import { CollisionSystem } from "./systems/CollisionSystem.js";
import { MapTransitionSystem } from "./systems/MapTransitionSystem.js";
import { RuntimeMapManager } from "../runtime/RuntimeMapManager.js";
import { RuntimeWorldManager } from "../runtime/RuntimeWorldManager.js";
import { PrefabRegistry } from "../runtime/PrefabRegistry.js";
import { ServerEntityManager } from "../runtime/ServerEntityManager.js";
import { GameEntity } from "./entities/GameEntity.js";
import { validateInstance, resolveEntity } from "../runtime/EntityFactory.js";
import { AOI_MODE, AOI_REGION_RADIUS, AOI_RADIUS_SQ, INTERACTION_RANGE_SQ, DEBUG_SEND_ENTITY_HITBOXES, TILE_SIZE, DEFAULT_ENTITY_HITBOX } from "../../../src/shared/core/Config.js";
import { resolveInteractionResult } from "./interactions/resolveInteractionResult.js";
import { applyInteractionCommands, DIR_DELTAS, DEFAULT_SCRIPTED_STEP_TICKS } from "./interactions/applyInteractionCommands.js";

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
    this.mapTransitionSystem = new MapTransitionSystem(config.serverName);
    this.runtimeMaps = new RuntimeMapManager();
    this.runtimeWorlds = new RuntimeWorldManager();
    this.prefabs = new PrefabRegistry();
    this.entities = new ServerEntityManager();
  }

  /**
   * Starts the server: loads world and maps, opens WebSocket, starts tick loop.
   * If a startWorldId is configured, loads the world and all its maps.
   * Otherwise falls back to loading only the startMapId (single-map mode).
   */
  async start() {
    const tag = `[${this.config.serverName}]`;

    if (this.config.startWorldId) {
      // World mode: load world definition + all maps in the world
      const world = await this.runtimeWorlds.loadWorld(this.config.startWorldId);
      console.log(
        `${tag} Loaded world "${world.id}" (${world.maps.length} maps, region ${world.regionWidth}x${world.regionHeight} tiles)`,
      );

      // Validate that startMapId belongs to this world
      const startCell = this.runtimeWorlds.getMapCell(this.config.startWorldId, this.config.startMapId);
      if (!startCell) {
        throw new Error(
          `startMapId "${this.config.startMapId}" not found in world "${this.config.startWorldId}"`,
        );
      }

      // Load all maps in the world
      const mapIds = this.runtimeWorlds.getMapIds(this.config.startWorldId);
      for (const mapId of mapIds) {
        const map = await this.runtimeMaps.loadMap(mapId);
        console.log(`${tag}   Loaded map "${map.id}" (${map.width}x${map.height})`);
      }
    } else {
      // Single-map mode (legacy)
      const map = await this.runtimeMaps.loadMap(this.config.startMapId);
      console.log(
        `${tag} Loaded map ${map.id} (${map.width}x${map.height})`,
      );
    }

    // Load entity prefabs
    const prefabCount = await this.prefabs.loadAll();
    console.log(`${tag} Loaded ${prefabCount} entity prefab(s)`);

    // Spawn authored entities for all loaded maps
    for (const mapId of this.runtimeMaps.maps.keys()) {
      this.spawnEntitiesForMap(mapId);
    }
    if (this.entities.count() > 0) {
      console.log(`${tag} Total runtime entities: ${this.entities.count()}`);
    }

    await this.network.start();
    console.log(
      `${tag} WebSocket listening on ${this.config.host}:${this.config.port}`,
    );

    this.loop.start();
    console.log(
      `${tag} Started at ${this.config.tickRate} TPS`,
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
   * Resolves and spawns all authored entities for a map into the ServerEntityManager.
   * Validates each instance, resolves prefabs, and logs results.
   * Called during start() for each loaded map. Designed for future dynamic region loading.
   * @param {string} mapId
   */
  spawnEntitiesForMap(mapId) {
    const tag = `[${this.config.serverName}]`;
    const instances = this.runtimeMaps.getMapEntities(mapId);
    if (instances.length === 0) return;

    const seenIds = new Set();
    let spawned = 0;

    for (const instance of instances) {
      // Pre-resolve validation
      const check = validateInstance(instance);
      if (!check.ok) {
        console.warn(`${tag} [entities] Invalid entity in map "${mapId}": ${check.error}`);
        continue;
      }

      // Duplicate authored id within this map
      if (seenIds.has(instance.id)) {
        console.warn(
          `${tag} [entities] Duplicate entity id "${instance.id}" in map "${mapId}" — skipping`,
        );
        continue;
      }
      seenIds.add(instance.id);

      // Resolve prefab + instance overrides
      let resolved;
      try {
        resolved = resolveEntity(instance, this.prefabs);
      } catch (err) {
        console.warn(`${tag} [entities] ${err.message}`);
        continue;
      }

      // Create runtime entity
      const entity = new GameEntity(
        this.entities.nextId(),
        resolved.authoredId,
        mapId,
        resolved.kind,
        resolved.x,
        resolved.y,
        resolved.params,
        resolved.components,
      );
      this.entities.register(entity);
      spawned++;
    }

    if (spawned > 0) {
      console.log(`${tag}   Spawned ${spawned} entity(s) for map "${mapId}"`);
    }
  }

  /**
   * Removes all runtime entities belonging to a map from the ServerEntityManager.
   * Designed for future dynamic region unloading.
   * @param {string} mapId
   */
  despawnEntitiesForMap(mapId) {
    const count = this.entities.removeByMap(mapId);
    if (count > 0) {
      console.log(
        `[${this.config.serverName}] Despawned ${count} entity(s) for map "${mapId}"`,
      );
    }
  }

  /**
   * Main simulation tick. Runs movement, map transitions, and periodic debug logging.
   * @param {number} dt - Tick duration in milliseconds.
   */
  update(dt) {
    this.tickCount++;
    this.movementSystem.update(
      this.players, dt, this.config,
      this.runtimeMaps, this.collisionSystem, this.runtimeWorlds,
      this.entities,
    );

    // Check for map border crossings after movement
    this.mapTransitionSystem.update(this.players, this.runtimeMaps, this.runtimeWorlds);

    // Process queued scripted entity movement (one step per interval)
    this._processScriptedMovement();

    if (this.tickCount % this.config.snapshotInterval === 0) {
      this.broadcastSnapshots();
    }

    if (this.tickCount > 0 && this.tickCount % 20 === 0) {
      const tag = `[${this.config.serverName}]`;
      console.log(`${tag} Tick ${this.tickCount}`);
      for (const player of this.players.values()) {
        console.log(
          `${tag}   ${player.id} map=${player.mapId} pos=(${player.x.toFixed(2)}, ${player.y.toFixed(2)}) vel=(${player.vx.toFixed(2)}, ${player.vy.toFixed(2)}) facing=${player.facing}`,
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
          this.config.startWorldId ?? null,
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
        if (msg.seq <= player.input.lastSeq) return;

        player.input.enqueue(msg.seq, msg.input);
        // lastProcessedSeq updated by MovementSystem after processing the queue
        break;
      }

      case MSG_TYPES.INTERACT: {
        const session = this.sessions.getByConnection(conn.id);
        if (!session) return;

        const validation = validateInteract(msg);
        if (!validation.ok) {
          console.warn(`[${this.config.serverName}] Invalid interact from ${conn.id}: ${validation.error}`);
          return;
        }

        const player = this.players.get(session.playerId);
        if (!player) return;

        const result = this._resolveInteraction(player, msg.targetId);
        if (result) {
          conn.send(createMessage(MSG_TYPES.INTERACT_RESULT, result));
        }
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
   * Each client receives: itself (always first) + visible players filtered by AOI_MODE.
   * Legacy (no worldId): same mapId + radius. World-aware: configurable region/radius/both.
   */
  broadcastSnapshots() {
    // Pre-compute world data and region cells once per broadcast tick
    const worldDataCache = new Map();
    const cellCache = new Map();
    for (const player of this.players.values()) {
      worldDataCache.set(player.id, this._toWorldPlayerData(player));
      if (player.worldId) {
        cellCache.set(player.id, this.runtimeWorlds.getMapCell(player.worldId, player.mapId));
      }
    }

    for (const session of this.sessions.getAll()) {
      const conn = this.network.getConnection(session.connectionId);
      if (!conn) continue;

      const selfPlayer = this.players.get(session.playerId);
      if (!selfPlayer) continue;

      const selfWorldData = worldDataCache.get(selfPlayer.id);

      // Self always first
      const visiblePlayers = [selfWorldData];

      for (const other of this.players.values()) {
        if (other.id === selfPlayer.id) continue;

        // ── Legacy path: no worldId (single-map mode) ──
        if (!selfPlayer.worldId) {
          if (other.mapId !== selfPlayer.mapId) continue;
          const otherWorldData = worldDataCache.get(other.id);
          const dx = otherWorldData.x - selfWorldData.x;
          const dy = otherWorldData.y - selfWorldData.y;
          if (dx * dx + dy * dy <= AOI_RADIUS_SQ) {
            visiblePlayers.push(otherWorldData);
          }
          continue;
        }

        // ── World-aware path ──
        if (other.worldId !== selfPlayer.worldId) continue;

        let visible = false;
        switch (AOI_MODE) {
          case "region":
            visible = this._isWithinRegionAOI(cellCache.get(selfPlayer.id), cellCache.get(other.id));
            break;
          case "radius":
            visible = this._isWithinRadiusAOI(selfWorldData, worldDataCache.get(other.id));
            break;
          case "region+radius":
            visible =
              this._isWithinRegionAOI(cellCache.get(selfPlayer.id), cellCache.get(other.id)) &&
              this._isWithinRadiusAOI(selfWorldData, worldDataCache.get(other.id));
            break;
        }

        if (visible) {
          visiblePlayers.push(worldDataCache.get(other.id));
        }
      }

      // Non-player entities: AOI-filtered (same mode as players)
      const { entities: visibleEntities, debugHitboxes } = this._getVisibleEntities(selfPlayer, selfWorldData, cellCache);

      const snapshot = {
        tick: this.tickCount,
        lastProcessedSeq: selfPlayer.lastProcessedSeq,
        players: visiblePlayers,
        entities: visibleEntities,
      };
      if (DEBUG_SEND_ENTITY_HITBOXES && debugHitboxes.length > 0) {
        snapshot.debugEntityHitboxes = debugHitboxes;
      }
      conn.send(createMessage(MSG_TYPES.SNAPSHOT, snapshot));
    }
  }

  /**
   * Checks whether two players are within region AOI (grid distance).
   * @param {{ rx: number, ry: number }} selfCell - Region cell of the observing player.
   * @param {{ rx: number, ry: number }} otherCell - Region cell of the other player.
   * @returns {boolean} True if within AOI_REGION_RADIUS in both axes.
   */
  _isWithinRegionAOI(selfCell, otherCell) {
    if (!selfCell || !otherCell) return false;
    return (
      Math.abs(otherCell.rx - selfCell.rx) <= AOI_REGION_RADIUS &&
      Math.abs(otherCell.ry - selfCell.ry) <= AOI_REGION_RADIUS
    );
  }

  /**
   * Checks whether two players are within radius AOI (world-space distance).
   * @param {{ x: number, y: number }} selfData - World-space snapshot of the observing player.
   * @param {{ x: number, y: number }} otherData - World-space snapshot of the other player.
   * @returns {boolean} True if squared distance is within AOI_RADIUS_SQ.
   */
  _isWithinRadiusAOI(selfData, otherData) {
    const dx = otherData.x - selfData.x;
    const dy = otherData.y - selfData.y;
    return dx * dx + dy * dy <= AOI_RADIUS_SQ;
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
      player: this._toWorldPlayerData(player),
    });
  }

  /**
   * Converts a player's map-local data to world-space coordinates for protocol output.
   * In single-map mode (no worldId), returns raw map-local data unchanged.
   * @param {ServerPlayer} player
   * @returns {object} Player snapshot data with world-space x/y.
   */
  _toWorldPlayerData(player) {
    const data = player.toData();

    if (player.worldId) {
      const cell = this.runtimeWorlds.getMapCell(player.worldId, player.mapId);
      if (cell) {
        const size = this.runtimeWorlds.getRegionSizePx(player.worldId);
        data.x += cell.rx * size.widthPx;
        data.y += cell.ry * size.heightPx;
      }
    }

    return data;
  }

  /**
   * Validates and resolves an interaction attempt between a player and a target entity.
   * Checks: entity exists, map/world context, interaction component, range.
   * @param {ServerPlayer} player
   * @param {string} targetId - Runtime entity id.
   * @returns {object|null} Interaction result payload, or null if invalid.
   */
  _resolveInteraction(player, targetId) {
    const tag = `[${this.config.serverName}]`;
    const entity = this.entities.get(targetId);

    if (!entity) {
      console.log(`${tag} [interact] Player ${player.id} → entity "${targetId}" not found`);
      return null;
    }

    // Validate interaction component
    const interaction = entity.components.interaction;
    if (!interaction || interaction.trigger !== "action") {
      console.log(`${tag} [interact] Entity "${targetId}" has no action trigger`);
      return null;
    }

    // Validate map/world context (same logic as snapshot visibility)
    if (!this._isEntityRelevantToPlayer(player, entity)) {
      console.log(`${tag} [interact] Entity "${targetId}" not relevant to player ${player.id}`);
      return null;
    }

    // Distance check (feet-to-feet, world-space)
    const playerWorld = this._toWorldPlayerData(player);
    const entityWorld = this._toWorldEntityData(entity, player.worldId ?? null);
    const dx = entityWorld.x - playerWorld.x;
    const dy = entityWorld.y - playerWorld.y;
    if (dx * dx + dy * dy > INTERACTION_RANGE_SQ) {
      console.log(`${tag} [interact] Entity "${targetId}" out of range for player ${player.id}`);
      return null;
    }

    // Normalize interaction to event-shaped result
    const resolved = resolveInteractionResult(interaction);
    if (!resolved) {
      console.log(`${tag} [interact] Unsupported interaction on entity "${targetId}"`);
      return null;
    }

    // Apply authoritative world mutations before returning result
    applyInteractionCommands(resolved.commands, {
      findEntityByAuthoredId: (authoredId) => this.entities.getByAuthoredId(player.mapId, authoredId),
      logTag: `${tag} [interact]`,
    });

    console.log(`${tag} [interact] Player ${player.id} → entity "${targetId}" (event, ${resolved.commands.length} cmds)`);
    return {
      entityId: entity.runtimeId,
      authoredId: entity.authoredId,
      ...resolved,
    };
  }

  /**
   * Checks whether an entity is relevant to a player (same visibility rules as snapshots).
   * World mode: entity's map region must pass the current AOI_MODE check.
   * Legacy single-map: entity must be on the same mapId.
   * @param {ServerPlayer} player
   * @param {GameEntity} entity
   * @returns {boolean}
   */
  _isEntityRelevantToPlayer(player, entity) {
    if (!player.worldId) {
      // Legacy single-map mode
      return entity.mapId === player.mapId;
    }

    const playerCell = this.runtimeWorlds.getMapCell(player.worldId, player.mapId);
    const entityCell = this.runtimeWorlds.getMapCell(player.worldId, entity.mapId);
    if (!playerCell || !entityCell) return false;

    switch (AOI_MODE) {
      case "region":
        return this._isWithinRegionAOI(playerCell, entityCell);
      case "radius":
        return true; // radius check happens separately in distance validation
      case "region+radius":
        return this._isWithinRegionAOI(playerCell, entityCell);
      default:
        return false;
    }
  }

  /**
   * Returns AOI-filtered non-player entities for a client's snapshot.
   * Applies the same AOI_MODE logic as player filtering (region/radius/region+radius).
   * Legacy single-map mode: same mapId + radius check.
   * @param {ServerPlayer} selfPlayer
   * @param {{ x: number, y: number }} selfWorldData - Player's world-space position.
   * @param {Map<string, {rx: number, ry: number}>} cellCache - Pre-computed region cells.
   * @returns {{ entities: object[], debugHitboxes: object[] }} Snapshot-ready entity data and debug hitbox data.
   */
  _getVisibleEntities(selfPlayer, selfWorldData, cellCache) {
    const empty = { entities: [], debugHitboxes: [] };
    if (this.entities.count() === 0) return empty;

    const result = [];
    const debugHitboxes = [];
    const selfCell = cellCache.get(selfPlayer.id);

    /**
     * Adds an entity to the result list and collects debug hitbox data if solid.
     * @param {GameEntity} entity
     * @param {string|null} worldId
     */
    const addEntity = (entity, worldId) => {
      result.push(this._toWorldEntityData(entity, worldId));
      const hbData = entity.toDebugHitboxData();
      if (hbData) {
        // Convert hitbox position to world-space (same as entity snapshot)
        if (worldId) {
          const cell = this.runtimeWorlds.getMapCell(worldId, entity.mapId);
          if (cell) {
            const size = this.runtimeWorlds.getRegionSizePx(worldId);
            hbData.x += cell.rx * size.widthPx;
            hbData.y += cell.ry * size.heightPx;
          }
        }
        debugHitboxes.push(hbData);
      }
    };

    if (!selfPlayer.worldId) {
      // Legacy single-map mode: same map + radius
      for (const entity of this.entities.getByMap(selfPlayer.mapId)) {
        // Radius check needs world-space coords (same as map-local in single-map mode)
        if (this._isWithinRadiusAOI(selfWorldData, { x: entity.x, y: entity.y })) {
          addEntity(entity, null);
        }
      }
      return { entities: result, debugHitboxes };
    }

    // World mode: apply the same AOI_MODE switch as players
    const worldId = selfPlayer.worldId;
    const mapIds = this.runtimeWorlds.getMapIds(worldId);
    if (!mapIds) return { entities: result, debugHitboxes };

    for (const mapId of mapIds) {
      const mapCell = this.runtimeWorlds.getMapCell(worldId, mapId);
      if (!mapCell) continue;

      // Pre-check: skip maps outside region radius for modes that use it
      const regionOk = (AOI_MODE === "radius")
        ? true
        : this._isWithinRegionAOI(selfCell, mapCell);
      if (!regionOk) continue;

      for (const entity of this.entities.getByMap(mapId)) {
        const data = this._toWorldEntityData(entity, worldId);

        let visible = false;
        switch (AOI_MODE) {
          case "region":
            visible = true; // already passed region check above
            break;
          case "radius":
            visible = this._isWithinRadiusAOI(selfWorldData, data);
            break;
          case "region+radius":
            visible = this._isWithinRadiusAOI(selfWorldData, data);
            break;
        }

        if (visible) {
          addEntity(entity, worldId);
        }
      }
    }

    return { entities: result, debugHitboxes };
  }

  /**
   * Converts an entity's map-local snapshot data to world-space coordinates.
   * Same pattern as _toWorldPlayerData(): adds region pixel offset.
   * @param {GameEntity} entity
   * @param {string|null} worldId
   * @returns {object} Snapshot-ready entity data with world-space x/y.
   */
  _toWorldEntityData(entity, worldId) {
    const data = entity.toSnapshotData();

    if (worldId) {
      const cell = this.runtimeWorlds.getMapCell(worldId, entity.mapId);
      if (cell) {
        const size = this.runtimeWorlds.getRegionSizePx(worldId);
        data.x += cell.rx * size.widthPx;
        data.y += cell.ry * size.heightPx;
      }
    }

    return data;
  }

  /**
   * Processes queued scripted movement for all entities with sub-tile smoothing.
   * Each tile step is spread across stepTicks ticks instead of teleporting instantly.
   * Collision is checked once per tile at step start; sub-tick movement is linear.
   * Snaps to exact tile target on each step completion to avoid floating-point drift.
   * @private
   */
  _processScriptedMovement() {
    for (const entity of this.entities.getAll()) {
      const sm = entity.scriptedMove;
      if (!sm) continue;

      // Phase 1: Continue an active sub-step
      if (sm.active) {
        sm.active.ticksLeft--;
        if (sm.active.ticksLeft <= 0) {
          // Snap to exact target to avoid float drift (e.g. 16/3 = 5.333...)
          entity.x = sm.active.targetX;
          entity.y = sm.active.targetY;
          sm.active = null;
        } else {
          entity.x += sm.active.perTickDx;
          entity.y += sm.active.perTickDy;
        }
      }

      // Phase 2: If no active sub-step, start the next queued step
      if (!sm.active && sm.queue.length > 0) {
        const step = sm.queue[0];
        const delta = DIR_DELTAS[step.dir];
        const map = this.runtimeMaps.getMap(entity.mapId);
        if (!map) {
          entity.scriptedMove = null;
          continue;
        }

        const hitbox = entity.components?.collision?.hitbox ?? DEFAULT_ENTITY_HITBOX;
        const targetX = entity.x + delta.dx * TILE_SIZE;
        const targetY = entity.y + delta.dy * TILE_SIZE;

        if (this.collisionSystem.isWalkable(map, targetX, targetY, hitbox)) {
          sm.queue.shift();
          // Update facing to match step direction
          if (entity.components?.visual) {
            entity.components.visual.direction = step.dir;
          }
          if (sm.stepTicks <= 1) {
            // stepTicks=1: instant move (same as old behavior)
            entity.x = targetX;
            entity.y = targetY;
          } else {
            sm.active = {
              perTickDx: (delta.dx * TILE_SIZE) / sm.stepTicks,
              perTickDy: (delta.dy * TILE_SIZE) / sm.stepTicks,
              targetX,
              targetY,
              ticksLeft: sm.stepTicks,
            };
            // Apply first tick of movement immediately (no wasted tick)
            sm.active.ticksLeft--;
            entity.x += sm.active.perTickDx;
            entity.y += sm.active.perTickDy;
          }
        } else {
          // Blocked — abort all movement
          entity.scriptedMove = null;
          continue;
        }
      }

      // Clear when fully done (no active step, no queue)
      if (!sm.active && sm.queue.length === 0) {
        entity.scriptedMove = null;
      }
    }
  }
}
