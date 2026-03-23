import { Container } from "pixi.js";
import { Scene } from "../../shared/scene/Scene.js";
import { Camera } from "../../shared/render/Camera.js";
import { GameMap } from "../../shared/data/models/GameMap.js";
import { TILE_SIZE, DEBUG_FLAGS } from "../../shared/core/Config.js";
import { EntityManager } from "../../shared/data/models/EntityManager.js";
import { EntityRenderer } from "../../shared/render/EntityRenderer.js";
import { Player } from "../game/Player.js";
import { PlayerView } from "../game/PlayerView.js";
import { ChunkDebugOverlay } from "../render/ChunkDebugOverlay.js";
import { TileLayerDebugOverlay } from "../render/TileLayerDebugOverlay.js";
import { HitboxDebugOverlay } from "../render/HitboxDebugOverlay.js";
import { WorldData } from "../world/WorldData.js";
import { LoadedRegion } from "../world/LoadedRegion.js";
import { TileCollision } from "../../shared/data/TileCollision.js";
import { makeRegionKey, worldToRegion, regionToWorldOffset } from "../../shared/world/WorldMath.js";
import { NetworkManager } from "../network/NetworkManager.js";

export class SceneMap extends Scene {
  constructor(gameStart = {}) {
    super();
    this.gameStart = gameStart;
  }

  async enter(engine) {
    this.engine = engine;
    this.root = new Container();
    engine.renderer.stage.addChild(this.root);

    this.viewport = engine.renderer.viewport;

    // World metadata (optional)
    this.worldData = null;
    this.regionPixelWidth = null;
    this.regionPixelHeight = null;

    if (this.gameStart.worldId) {
      this.worldData = await WorldData.load(`/content/worlds/${this.gameStart.worldId}.json`);
      this.regionPixelWidth = this.worldData.regionWidth * TILE_SIZE;
      this.regionPixelHeight = this.worldData.regionHeight * TILE_SIZE;
    }

    // Global layer groups for multi-region z-order
    this.groundLayer = new Container();
    this.groundDetailLayer = new Container();
    this.entityLayer = new Container();
    this.fringeLayer = new Container();

    this.root.addChild(this.groundLayer);
    this.root.addChild(this.groundDetailLayer);
    this.root.addChild(this.entityLayer);
    this.root.addChild(this.fringeLayer);

    // Region loading state
    this.loadedRegions = new Map();
    this._loadingKeys = new Set();
    this._currentRegionRx = 0;
    this._currentRegionRy = 0;

    // Load initial map and regions
    const DEFAULT_MAP = "test_map";
    const mapId = this.gameStart.mapId || DEFAULT_MAP;

    if (this.worldData) {
      const startEntry = this.worldData.getMapEntry(mapId);
      this._currentRegionRx = startEntry?.rx ?? 0;
      this._currentRegionRy = startEntry?.ry ?? 0;

      const surroundings = this._getRegionCoordsInRadius(this._currentRegionRx, this._currentRegionRy, 1);
      await Promise.all(surroundings.map(({ rx, ry }) => this._ensureRegionLoaded(rx, ry)));
    } else {
      // No world data — load single map as direct region at (0,0)
      let map;
      try {
        map = await GameMap.load(`/content/maps/${mapId}.json`);
      } catch (err) {
        console.warn(`[SceneMap] Failed to load map "${mapId}", falling back to "${DEFAULT_MAP}":`, err.message);
        map = await GameMap.load(`/content/maps/${DEFAULT_MAP}.json`);
      }
      const region = new LoadedRegion(0, 0, mapId, map, 0, 0, this.viewport);
      this.loadedRegions.set(makeRegionKey(0, 0), region);
      this._addRegionToLayers(region);
    }

    // Compatibility aliases — point to current region
    this._updatePrimaryRegion();

    // Camera
    this.camera = new Camera(this.viewport);
    if (this.worldData) {
      const wb = this._computeWorldBounds();
      if (wb) {
        this.camera.setWorldBounds(wb.left, wb.top, wb.right, wb.bottom);
      } else {
        this.camera.setBounds(this.map.width, this.map.height);
      }
    } else {
      this.camera.setBounds(this.map.width, this.map.height);
    }

    // Collision resolver: world-aware (multi-region) or simple local (single map)
    if (this.worldData) {
      this._collides = (wx, wy, hb) => this._collidesAtWorld(wx, wy, hb);
    } else {
      this._collides = (wx, wy, hb) => TileCollision.collidesWithLayer(this.map, "collision", wx, wy, hb);
    }

    // Entities
    this.entityManager = new EntityManager();
    this.entityRenderer = new EntityRenderer(this.entityLayer);

    // Remote players: serverId → { player: Player, view: PlayerView }
    this.remotePlayers = new Map();

    // Player — updated manually, not through EntityManager
    // Spawn in world space: local tile coords + region world offset
    let spawnX = (this.gameStart.x ?? 0) * TILE_SIZE + 8;   // feet: center of tile
    let spawnY = (this.gameStart.y ?? 0) * TILE_SIZE + 16;  // feet: bottom of tile
    if (this.worldData) {
      spawnX += this._currentRegionRx * this.regionPixelWidth;
      spawnY += this._currentRegionRy * this.regionPixelHeight;
    }
    this.player = new Player(spawnX, spawnY);
    this.playerView = new PlayerView(this.entityLayer);
    this.camera.follow(this.player);

    // Debug overlays (sync with debug mode)
    this.collisionDebug = new TileLayerDebugOverlay(
      this.map,
      this.viewport,
      "collision",
      0xff0000,
    );
    this.root.addChild(this.collisionDebug.container);

    this.hitboxDebug = new HitboxDebugOverlay();
    this.root.addChild(this.hitboxDebug.container);

    this.chunkDebug = new ChunkDebugOverlay(this.map, this.viewport);
    this.chunkDebug.enabled = false;
    this.root.addChild(this.chunkDebug.container);

    // Set initial debug overlay offset from the primary region
    const primaryKey = makeRegionKey(this._currentRegionRx, this._currentRegionRy);
    const primaryRegion = this.loadedRegions.get(primaryKey);
    if (primaryRegion) {
      this._updateDebugOverlayRegion(primaryRegion);
    }

    // Network — connect to game server
    this.serverId = null;
    this.network = new NetworkManager("ws://127.0.0.1:3001");

    this.network.onWelcome = (msg) => {
      this.serverId = msg.player.id;
      console.log(`[SceneMap] Welcome — server player ${this.serverId} at (${msg.player.x}, ${msg.player.y})`);
    };

    this.network.onSnapshot = (msg) => {
      if (!this.player || !this.serverId) return;

      // Local player: reconcile with prediction
      const self = msg.players.find(p => p.id === this.serverId);
      if (self) this.player.reconcile(self, msg.lastProcessedSeq, this._collides);

      // Remote players: spawn / update / despawn
      const snapshotIds = new Set();
      for (const p of msg.players) {
        if (p.id === this.serverId) continue;
        snapshotIds.add(p.id);

        let entry = this.remotePlayers.get(p.id);
        if (!entry) {
          const player = new Player(p.x, p.y);
          player.isRemote = true;
          const view = new PlayerView(this.entityLayer);
          entry = { player, view };
          this.remotePlayers.set(p.id, entry);
          // Sync view immediately so the sprite doesn't flash at (0,0)
          view.updateFromEntity(player, 1);
        }

        entry.player.pushRemoteSnapshot(p, performance.now());
      }

      // Remove players no longer in snapshot
      for (const [id, entry] of this.remotePlayers) {
        if (!snapshotIds.has(id)) {
          entry.view.destroy();
          this.remotePlayers.delete(id);
        }
      }
    };

    this.network.connect();
  }

  update(dt) {
    // Read input first — needed for prediction and network
    const inp = this.engine.input;
    const current = {
      up: inp.held("ArrowUp") || inp.held("KeyW"),
      down: inp.held("ArrowDown") || inp.held("KeyS"),
      left: inp.held("ArrowLeft") || inp.held("KeyA"),
      right: inp.held("ArrowRight") || inp.held("KeyD"),
    };

    // Lifecycle: save prev positions for interpolation
    this.player.update(dt);

    // Always send input to server regardless of prediction flag
    const seq = this.network.sendInput(current);

    if (DEBUG_FLAGS.NET_ENABLE_CLIENT_PREDICTION) {
      this.player.pushPendingInput(seq, current, dt);
      this.player.predict(dt, current, this._collides);
      this.player.syncLocalFromWorld();
    }

    this.entityManager.updateAll(dt, this.engine.input);

    // Remote players are interpolated in render() — no tick update needed

    // Region sync — load desired 3x3, unload stale
    if (this.worldData) {
      const { rx, ry } = this._getPlayerRegion();
      if (rx !== this._currentRegionRx || ry !== this._currentRegionRy) {
        this._currentRegionRx = rx;
        this._currentRegionRy = ry;
        this._syncRegions(rx, ry);
        this._updatePrimaryRegion();
      }
    }

    // Debug overlays
    this.collisionDebug.enabled = this.engine.debug.visible;
    this.hitboxDebug.enabled = this.engine.debug.visible;
    this.chunkDebug.enabled = this.engine.debug.visible;

    // Debug camera: IJKL enters free mode, WASD returns to follow
    const input = this.engine.input;
    if (
      input.held("KeyI") ||
      input.held("KeyJ") ||
      input.held("KeyK") ||
      input.held("KeyL")
    ) {
      this.camera.freeMode = true;
      this.camera.debugMove(input);
    } else if (
      input.held("KeyW") ||
      input.held("KeyA") ||
      input.held("KeyS") ||
      input.held("KeyD")
    ) {
      this.camera.freeMode = false;
    }

    // Debug info
    const d = this.engine.debug;
    const vp = this.engine.renderer.viewport;
    d.set("cam", `${Math.round(this.camera.x)}, ${Math.round(this.camera.y)}`);
    d.set(
      "player",
      `${Math.round(this.player.x)}, ${Math.round(this.player.y)} (tile ${Math.floor(this.player.x / TILE_SIZE)}, ${Math.floor(this.player.y / TILE_SIZE)})`,
    );
    // Use sprite center (8px offset) for chunk calculation
    const tileX = Math.floor((this.player.x + 8) / TILE_SIZE);
    const tileY = Math.floor((this.player.y + 8) / TILE_SIZE);
    const { cx, cy } = this.map.worldToChunk(tileX, tileY);
    d.set("chunk", `${cx}, ${cy}`);
    const currentRegion = this.loadedRegions.get(makeRegionKey(this._currentRegionRx, this._currentRegionRy));
    const regionMapId = currentRegion?.mapId ?? "?";
    d.set("region", `${this._currentRegionRx}, ${this._currentRegionRy} (${regionMapId})`);
    d.set("entities", this.entityManager.entities.size);
    d.set("viewport", `${vp.tilesX}x${vp.tilesY} @${vp.scale}x`);
    d.set("canvas", `${vp.cssWidth}x${vp.cssHeight}`);
    const el = this.engine.renderer.rootElement;
    d.set("container", `${el.clientWidth}x${el.clientHeight}`);
    d.set("prediction", DEBUG_FLAGS.NET_ENABLE_CLIENT_PREDICTION ? "ON" : "OFF");
    d.set("reconciliation", DEBUG_FLAGS.NET_ENABLE_RECONCILIATION ? "ON" : "OFF");
    d.set("remote interp", DEBUG_FLAGS.NET_ENABLE_REMOTE_INTERPOLATION ? "ON" : "OFF");

    // if (this.engine.debug.visible && this.chunkRenderer) {
    //   const ci = this.chunkRenderer.getDebugInfo();
    //   const chunkPx = this.map.chunkSize * this.map.tileSize;
    //   d.set("---chunks---", "");
    //   d.set("chunk size", `${this.map.chunkSize} tiles`);
    //   d.set("camera chunk", `${Math.floor(this.camera.x / chunkPx)},${Math.floor(this.camera.y / chunkPx)}`);
    //   d.set("visible chunks", ci.visibleChunkCount);
    //   d.set("views / chunks", `${ci.mountedViewCount}/${ci.visibleChunkCount}`);
    //   d.set(
    //     "entered",
    //     ci.enteredChunkCount > 0 ? ci.enteredChunkKeys.join(" ") : "",
    //   );
    //   d.set("exited", ci.exitedChunkCount > 0 ? ci.exitedChunkKeys.join(" ") : "");
    //   d.set("empty cached", ci.emptyKeyCount);
    //   if (ci.visibleChunkCount > 0) {
    //     const keys = ci.visibleChunkKeys.map(k => k.split(",").map(Number));
    //     const minX = Math.min(...keys.map(([x]) => x));
    //     const maxX = Math.max(...keys.map(([x]) => x));
    //     const minY = Math.min(...keys.map(([_, y]) => y));
    //     const maxY = Math.max(...keys.map(([_, y]) => y));
    //     d.set("chunk bounds", `${minX}-${maxX}, ${minY}-${maxY}`);
    //   }
    // }
  }

  render(alpha) {
    this.camera.renderUpdate(this.player, alpha);

    this.root.x = -this.camera.x;
    this.root.y = -this.camera.y;

    // Update chunk visibility for all loaded regions
    for (const region of this.loadedRegions.values()) {
      region.updateVisibility(this.camera);
    }

    this.collisionDebug.render(this.camera);
    this.chunkDebug.render(this.camera);
    this.entityRenderer.sync(this.entityManager.getAll(), alpha);
    this.playerView.updateFromEntity(this.player, alpha);

    // Interpolate and sync remote player views
    const now = performance.now();
    for (const { player, view } of this.remotePlayers.values()) {
      player.updateRemoteInterpolation(now);
      view.updateFromEntity(player, alpha);
    }
    this.hitboxDebug.render(this.player);
  }

  exit() {
    this.engine.renderer.stage.removeChild(this.root);
  }

  destroy() {
    this.network.disconnect();
    this.collisionDebug.destroy();
    this.hitboxDebug.destroy();
    this.chunkDebug.destroy();
    for (const region of this.loadedRegions.values()) {
      region.destroy();
    }
    this.loadedRegions.clear();
    for (const { view } of this.remotePlayers.values()) {
      view.destroy();
    }
    this.remotePlayers.clear();
    this.entityRenderer.destroy();
    this.playerView.destroy();
    this.root.destroy({ children: true });
  }

  // --- Region helpers ---

  _computeWorldBounds() {
    if (!this.worldData.maps.length) return null;

    let minRx = Infinity, maxRx = -Infinity;
    let minRy = Infinity, maxRy = -Infinity;
    for (const entry of this.worldData.maps) {
      if (entry.rx < minRx) minRx = entry.rx;
      if (entry.rx > maxRx) maxRx = entry.rx;
      if (entry.ry < minRy) minRy = entry.ry;
      if (entry.ry > maxRy) maxRy = entry.ry;
    }
    return {
      left: minRx * this.regionPixelWidth,
      top: minRy * this.regionPixelHeight,
      right: (maxRx + 1) * this.regionPixelWidth,
      bottom: (maxRy + 1) * this.regionPixelHeight,
    };
  }

  _collidesAtWorld(worldX, worldY, hitbox) {
    const left = worldX + hitbox.offsetX;
    const top = worldY + hitbox.offsetY;
    const right = left + hitbox.width - 1;
    const bottom = top + hitbox.height - 1;

    const corners = [
      { x: left, y: top },
      { x: right, y: top },
      { x: left, y: bottom },
      { x: right, y: bottom },
    ];

    const checked = new Set();
    for (const corner of corners) {
      const { rx, ry } = worldToRegion(corner.x, corner.y, this.regionPixelWidth, this.regionPixelHeight);
      const key = makeRegionKey(rx, ry);
      if (checked.has(key)) continue;
      checked.add(key);

      const region = this.loadedRegions.get(key);
      if (!region) return true;

      const local = region.worldToLocal(worldX, worldY);
      if (TileCollision.collidesWithLayer(region.map, "collision", local.x, local.y, hitbox)) {
        return true;
      }
    }
    return false;
  }

  _getPlayerRegion() {
    const hb = this.player.hitbox;
    const cx = this.player.worldX + hb.offsetX + hb.width / 2;
    const cy = this.player.worldY + hb.offsetY + hb.height / 2;
    return worldToRegion(cx, cy, this.regionPixelWidth, this.regionPixelHeight);
  }

  _getRegionCoordsInRadius(rx, ry, radius) {
    const coords = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        coords.push({ rx: rx + dx, ry: ry + dy });
      }
    }
    return coords;
  }

  /** Update this.map and this.chunkRenderer to the current region */
  _updatePrimaryRegion() {
    const key = makeRegionKey(this._currentRegionRx, this._currentRegionRy);
    const region = this.loadedRegions.get(key);
    if (region) {
      this.map = region.map;
      this.chunkRenderer = region.chunkRenderer;
      this._updateDebugOverlayRegion(region);
    }
  }

  _updateDebugOverlayRegion(region) {
    if (!this.collisionDebug) return; // not yet created during enter()
    this.collisionDebug.map = region.map;
    this.collisionDebug.setOffset(region.offsetX, region.offsetY);
    this.chunkDebug.map = region.map;
    this.chunkDebug.setOffset(region.offsetX, region.offsetY);
  }

  _addRegionToLayers(region) {
    this.groundLayer.addChild(region.getLayerContainer("ground"));
    this.groundDetailLayer.addChild(region.getLayerContainer("ground_detail"));
    this.fringeLayer.addChild(region.getLayerContainer("fringe"));
  }

  _removeRegionFromLayers(region) {
    const ground = region.getLayerContainer("ground");
    const detail = region.getLayerContainer("ground_detail");
    const fringe = region.getLayerContainer("fringe");

    if (ground.parent === this.groundLayer) this.groundLayer.removeChild(ground);
    if (detail.parent === this.groundDetailLayer) this.groundDetailLayer.removeChild(detail);
    if (fringe.parent === this.fringeLayer) this.fringeLayer.removeChild(fringe);
  }

  _syncRegions(rx, ry) {
    // Load set (radius 1 = 3×3) — regions to ensure loaded
    const loadCoords = this._getRegionCoordsInRadius(rx, ry, 1);

    // Keep set (radius 2 = 5×5) — hysteresis to avoid thrashing
    const keep = new Set();
    for (const coord of this._getRegionCoordsInRadius(rx, ry, 2)) {
      keep.add(makeRegionKey(coord.rx, coord.ry));
    }

    // Load desired first
    for (const coord of loadCoords) {
      this._ensureRegionLoaded(coord.rx, coord.ry);
    }

    // Unload only far-away regions — skip regions still being loaded
    for (const key of [...this.loadedRegions.keys()]) {
      if (!keep.has(key) && !this._loadingKeys.has(key)) {
        this._unloadRegion(key);
      }
    }
  }

  _unloadRegion(key) {
    const region = this.loadedRegions.get(key);
    if (!region) return;

    this._removeRegionFromLayers(region);
    region.destroy();
    this.loadedRegions.delete(key);
  }

  async _ensureRegionLoaded(rx, ry) {
    const key = makeRegionKey(rx, ry);
    if (this.loadedRegions.has(key) || this._loadingKeys.has(key)) return;

    const entry = this.worldData?.getEntry(rx, ry);
    if (!entry) return;

    this._loadingKeys.add(key);
    try {
      const map = await GameMap.load(`/content/maps/${entry.mapId}.json`);
      const offset = regionToWorldOffset(rx, ry, this.regionPixelWidth, this.regionPixelHeight);
      const region = new LoadedRegion(rx, ry, entry.mapId, map, offset.x, offset.y, this.viewport);

      this.loadedRegions.set(key, region);
      this._addRegionToLayers(region);
    } catch (err) {
      console.warn(`[SceneMap] Failed to load region (${rx},${ry}):`, err.message);
    } finally {
      this._loadingKeys.delete(key);
    }
  }
}
