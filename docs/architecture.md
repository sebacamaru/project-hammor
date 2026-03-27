# Architecture Details

## Module structure
```
src/
├── shared/    Reusable core: render pipeline, scene system, data models, assets
├── client/    Game runtime: ClientApp, Input, Player, gameplay scenes
├── editor/    Map editor: EditorApp, tools, panels, viewport, scenes
└── server/    Headless server: ServerApp, world management (skeleton)
```

### Dependency rules
- `shared/` → only `shared/` and npm packages
- `client/` → `shared/` and npm packages
- `editor/` → `shared/` and npm packages
- `server/` → `shared/core/` and `shared/data/` ONLY (never `shared/render/` or `shared/assets/`)

## Init sequence (ClientApp.start)
1. ProjectSettings.load() — fetch `/content/project.json` for gameStart config
2. Renderer.init() — compute viewport, create Pixi app at dynamic resolution, append canvas, setup resize
3. AssetManager.init() — register manifest
4. AssetManager.loadBundle('core') — load textures
5. new Input() — bind keyboard listeners
6. new SceneManager() — empty stack
7. new DebugOverlay() — attach to stage (starts hidden)
8. new GameLoop(clientApp) — ready but not running
9. If gameStart.worldId: WorldData.load() → fetch world JSON → index maps by region
10. SceneManager.goto(SceneMap, { gameStart, worldData }) — enter first scene
11. GameLoop.start() — begin RAF

## Data flow per frame
```
RAF tick
├── accumulator += frameTime
├── while (accumulator >= TICK_MS):
│   ├── Input.poll()
│   ├── SceneManager.update(dt)
│   │   └── SceneMap.update(dt)
│   │       ├── Player.update(dt) — saves prev positions
│   │       ├── NetworkManager.sendInput(current) — every frame, seq-numbered
│   │       ├── Player.pushPendingInput(seq, input, dt) + Player.predict(dt, input, collides)
│   │       ├── [async] Snapshot arrives → Player.reconcile(state, lastProcessedSeq, collides)
│   │       ├── EntityManager.updateAll(dt, input)
│   │       ├── Camera debug mode check (IJKL → free, WASD → follow)
│   │       └── Debug info update (cam, player, chunk, entities, viewport)
│   └── accumulator -= TICK_MS
├── alpha = accumulator / TICK_MS
└── ClientApp.render(alpha)
    ├── SceneManager.render(alpha)
    │   └── SceneMap.render(alpha)
    │       ├── Player.decayRenderError() — smooth correction blending
    │       ├── Camera.renderUpdate(player, alpha) — interpolate + recalc bounds
    │       ├── root.x/y = -camera (already round-snapped)
    │       ├── MapChunkRenderer.update(camera) — show/hide chunk views
    │       ├── Debug overlays: collision, chunk grid, hitbox
    │       ├── EntityRenderer.sync(entities, alpha) — round-snapped interpolation
    │       └── PlayerView.updateFromEntity(player, alpha) — round-snapped interpolation
    └── DebugOverlay.update(lastFrameTime)
```

## Viewport system

### Resolution selection algorithm
1. Try scales from MAX_SCALE (6) down to MIN_SCALE (2)
2. For each scale: `ceil(screenSize / (TILE_SIZE * scale))` → tile count (overscan)
3. Clamp tiles to MIN/MAX ranges
4. Accept first scale where MIN tiles fit in the screen
5. Center canvas with CSS offsets (may be negative due to overscan)

### Data flow
```
window resize → Renderer.resize()
  → computeViewport(parentW, parentH, viewportState)  // mutates in-place
  → app.renderer.resize(vp.widthPx, vp.heightPx)      // Pixi internal surface
  → applyViewport()                                     // CSS size + centering
  ↓
  Camera reads viewport.widthPx/heightPx (same reference)
  MapChunkRenderer reads viewport.tilesX/tilesY (same reference)
```

### Config constants (shared/core/Config.js)
- TILE_SIZE = 16, EMPTY_TILE = -1
- BASE_TILES_X = 40, BASE_TILES_Y = 22
- MIN_SCALE = 2, MAX_SCALE = 6
- MIN_TILES_X = 38, MAX_TILES_X = 46, MIN_TILES_Y = 20, MAX_TILES_Y = 26
- SERVER_TICK_RATE = 20, SERVER_TICK_MS = 50
- CLIENT_SIM_TICK_RATE = 60, CLIENT_SIM_TICK_MS ≈ 16.67
- SNAPSHOT_RATE = 20, SNAPSHOT_INTERVAL_TICKS = 1
- PLAYER_SPEED = 48
- AOI_MODE = "region", AOI_REGION_RADIUS = 1
- AOI_RADIUS = 160, AOI_RADIUS_SQ = 25600
- INTERACTION_RANGE = 32, INTERACTION_RANGE_SQ = 1024
- REMOTE_INTERPOLATION_DELAY_MS = 100, MAX_REMOTE_SNAPSHOTS = 20

## Scene lifecycle
- enter(engine) — create containers, load map, setup entities, pass viewport to Camera/MapChunkRenderer, add to stage
- update(dt) — game logic, entity updates, camera debug mode
- render(alpha) — camera interpolation, visual sync, chunk rendering, entity interpolation
- exit() — remove containers from stage
- destroy() — destroy all Pixi objects, clear references

## Entity system design

### Data layer (shared/data/models/)
- **Entity**: pure data object (id, x, y, prevX, prevY, worldX, worldY, direction, speed, type). Auto-increment ID. `syncLocalFromWorld()` copies world→local coords.
- **EntityManager**: Map<id, Entity>, add/remove/get/getAll/updateAll
- **EntityData**: serializable snapshot for network/persistence, with fromEntity()/toPlain()/fromPlain()
- **PlayerAnimations**: animation name → { row, speed } mapping + DIRECTION_NAMES array

### Coordinate convention
- **`player.x, player.y` = feet** (center-bottom of sprite, not top-left)
- Sprite (16x16) rendered at `(x - 8, y - 16)` — visual offset from feet
- Hitbox relative to feet: `{ offsetX: -4, offsetY: -4, width: 8, height: 4 }`
- Server and client both use this same reference point for collision and rendering

### Client gameplay (client/game/)
- **Player extends Entity**: server-driven, no local movement
- **Player.update(dt)**: ONLY saves prev positions for interpolation. No input, no collision.
- **Player.applyServerState(state)**: applies authoritative position from server snapshot. Updates worldX/worldY, direction, moving flag. Skips micro-updates (epsilon check).
- **Player.hitbox**: `{ offsetX: -4, offsetY: -4, width: 8, height: 4 }` — AABB relative to **feet**
- **PlayerView**: owns AnimatedSprite, renders with offset from feet `(x-8, y-16)`, animation map from spritesheet
- **NetworkManager** (`client/network/`): WebSocket wrapper, sends hello/input, receives welcome/snapshot via callbacks

### Render layer (shared/render/)
- **EntityRenderer**: Map<id, Sprite>, creates sprites on first sync, interpolates with Math.round
- **MapChunkRenderer**: chunk-based tilemap rendering (see Tilemap section)

## Data model (shared/data/)

### Map data (chunk-based)
- **MapData**: width, height, tileSize, chunkSize, layerNames, chunks Map<string, ChunkData>. getTile/setTile delegate to chunks via worldToChunk(). Has dirty tracking (`dirtyChunks`, `markChunkDirty()`, `consumeDirty()`). `setTile()` returns change metadata or null. `getTile()` returns -1 for out-of-bounds.
- **ChunkData**: cx, cy, chunkSize, layers Map<string, Int16Array> (filled with -1). getTile/setTile with bounds checks. Out-of-bounds returns -1.
- **GameMap**: static facade — `GameMap.load(url)` delegates to MapLoader.
- **TileCollision**: static `collidesWithLayer(map, layerName, x, y, hitbox)` — AABB vs tile grid check.

### Map layers
- `ground` — base terrain tiles
- `ground_detail` — decorative tiles above ground (below entities)
- `fringe` — tiles rendered above entities (tree tops, roofs, etc.)
- `collision` — collision mask (tile >= 0 = blocked, -1 = passable)

### Serialization pipeline
- **MapLoader**: fetch map JSON + tileset JSON, build MapData with chunks from raw tile arrays
- **MapSerializer**: serialize(mapData) → JSON object, deserialize(json) → MapData
- **MapValidator**: validate(mapData) → { valid, errors[] }

### Map JSON format
```json
{
  "id": "test_map",
  "width": 100, "height": 100,
  "tileSize": 16, "chunkSize": 16,
  "tileset": "world",
  "layers": ["ground", "ground_detail", "fringe", "collision"],
  "chunks": [
    { "cx": 0, "cy": 0, "tiles": {
      "ground": { "encoding": "raw", "data": [0, 1, ...] },
      "collision": { "encoding": "raw", "data": [] }
    }}
  ]
}
```

### Tileset JSON format (content/tilesets/)
```json
{
  "image": "atlas_world", "tileSize": 16, "columns": 32,
  "editor": {
    "groups": [
      { "id": "terrain", "name": "Terrain", "startId": 0, "count": 32 }
    ]
  }
}
```
- `editor.groups` defines named tile groups for the TilesPanel UI
- **TilesetRegistry** (`shared/data/loaders/TilesetRegistry.js`): static cache-based loader, fetches from `/content/tilesets/{id}_tileset.json`. Used by both editor and MapLoader.

## Tilemap rendering (chunk-based)
- **MapChunkRenderer**: manages ChunkLayerViews for visible chunks. One Container per layer for z-order control.
  - Uses **VisibleChunkTracker** to compute enter/exit diff per frame (incremental mount/hide)
  - Lazily creates ChunkLayerView when chunk enters view for first time
  - Hides (visible=false) chunk views that leave the viewport
  - Tracks empty chunk+layer combos to skip re-checking
  - Caches tile Textures (sliced from atlas) in a Map<tileId, Texture>
  - `rebuildChunk(cx, cy)` for editor/dynamic tile changes
  - Exposes `_lastVisible`, `_lastEntered`, `_lastExited` for debug overlay
- **VisibleChunkTracker**: pure chunk visibility differ. `update(camX, camY, viewW, viewH)` → `{ entered, exited, visible }` Sets.
- **ChunkLayerView**: Container of Sprites for one chunk's one layer. Positioned at world coords (cx * chunkSize * tileSize).
- Z-order in SceneMap: ground container → ground_detail container → entities → fringe container

## World streaming (client)

### Bootstrap & config
- `ProjectSettings` (`shared/data/loaders/ProjectSettings.js`): loads `/content/project.json`, provides `{ gameStart: { worldId?, mapId, x, y } }` with safe defaults
- `WorldData` (`client/world/WorldData.js`): loads `/content/worlds/{id}.json`, indexes maps by region `_byRegion` and `_byMapId`
- `WorldMath` (`shared/world/WorldMath.js`): `makeRegionKey(rx,ry)`, `worldToRegion(worldX, worldY, rw, rh)`, `regionToWorldOffset(rx, ry, rw, rh)`

### Region management
- `LoadedRegion` (`client/world/LoadedRegion.js`): wraps MapData + MapChunkRenderer with world offset
  - `offsetX/Y` = region grid coords × regionPixelWidth/Height
  - `worldToLocal(wx, wy)` for coordinate conversion
  - `updateVisibility(camera)` syncs chunk renderer from world-space camera
  - Layer containers positioned at offset so chunks render in world space

### SceneMap region streaming
```
_syncRegions(rx, ry)
├── Load set: _getRegionCoordsInRadius(rx, ry, 1) → 3×3
├── Keep set: _getRegionCoordsInRadius(rx, ry, 2) → 5×5 (hysteresis)
├── Load: _ensureRegionLoaded() for each in load set
└── Unload: remove regions outside keep set (skip _loadingKeys)
```
- `_ensureRegionLoaded(rx, ry)`: async fetch map → create LoadedRegion → add to layers
- `_loadingKeys` Set prevents duplicate loads and premature unloads
- Layer containers per region added to shared ground/detail/fringe parent containers

### World-aware collision
- `_collidesAtWorld(worldX, worldY, hitbox)`: checks all affected regions
- Hitbox corners → region grid → each region's collision layer
- Unloaded regions = collision (fail-safe)

### World-aware camera
- `Camera.setWorldBounds(left, top, right, bottom)` for world-extent clamping
- `_computeWorldBounds()` in SceneMap calculates from all worldData map entries

### World JSON formats
Runtime (`content/worlds/{id}.json`):
```json
{ "id": "main_world", "regionWidth": 192, "regionHeight": 192,
  "maps": [{ "mapId": "test_map", "rx": 0, "ry": 0 }, ...] }
```
Authored (`content/worlds/.authored/{id}.json`):
```json
{ "id": "main_world", "name": "...", "version": 1,
  "mapSize": { "width": 192, "height": 192 },
  "cells": { "0,0": { "mapId": "test_map" }, ... } }
```

## Debug overlays (client/render/)
- **ChunkDebugOverlay**: blue tile grid lines + red chunk boundary lines (2px). Uses Graphics.rect + fill.
- **TileLayerDebugOverlay**: highlights tiles in a named layer (used for collision). Configurable color.
- **HitboxDebugOverlay**: renders player hitbox (cyan), solid entity hitboxes (red). Entity hitbox data comes from `debugEntityHitboxes` in snapshots (gated by `DEBUG_SEND_ENTITY_HITBOXES`).
- All toggle with Escape (sync with `engine.debug.visible`).

## Pixel-perfect rendering rules
- All render-time positions use `Math.round` (sprites AND camera)
- Camera and sprites must use the SAME rounding function to avoid 1px oscillation
- Game logic keeps float coordinates — rounding is render-only
- `roundPixels: true` in PixiJS as GPU-level safety net

## Editor architecture (shell + workspaces)

The editor uses a **shell + workspaces** pattern. `EditorShell` manages tabs and workspace lifecycle. Each workspace is an independent module with its own DOM, state, and tools.

### Shell layer
```
EditorShell — src/editor/shell/EditorShell.js
├── ShellState         — active workspace ID, pub-sub
├── WorkspaceRegistry  — factory map for workspace creation
├── DialogHost         — Promise-based confirm dialog (.editor-dialog-layer)
├── Tab bar            — one tab per registered workspace
├── Ctrl+S delegation  — routes to active workspace's save() if canSave()
└── Editor API         — { confirm } passed to workspaces on mount
```

**Workspace interface**: `mount(host, editorApi)`, `unmount()`, `resize()`, `update(dt)`, `canSave()`, `save()`, `getTitle()`

**Editor API** (passed as second arg to `mount`): `{ confirm(options) → Promise<boolean> }` — small API object, not the full shell. Workspaces use `this.editor.confirm(...)` for confirmation dialogs.

### Map workspace (MapEditorApp)
```
MapEditorApp — src/editor/workspaces/map/MapEditorApp.js
├── MapEditorLayout   — HTML layout (viewport, toolbar, panels, status bar)
├── MapEditorState    — central state: activeTool, activeLayer, visibleLayers,
│                       selectedBrush, camera {x,y,zoom}, map, hoverTile, dirty
├── MapDocument       — authoring data (Uint16Array flat, 0xffff=empty)
│   ├── event subscription system (subscribe/emit)
│   ├── write-lock safety (withWriteLock)
│   └── dirty tracking
├── History           — undo/redo (command pattern)
│   ├── PaintTilesCommand — stores forward + inverse tile changes
│   └── EraseTilesCommand — sets tiles to -1
├── RuntimeMapBridge  — MapDocument → MapData (full rebuild)
├── MapEditorViewport — canvas mouse/keyboard events → pointer context → ToolManager
│   └── Temporary pan activation: Space+left drag or middle mouse drag
├── ToolManager       — tool registry, temporaryToolId for transient tool switching
│   ├── PanTool / PencilTool / EraseTool / EyedropperTool
├── Panels            — ToolbarPanel, ToolsPanel, LayersPanel, StatusBarPanel, TilesPanel, LightingPanel
│   └── TilesPanel    — group selector + tile picker grid (from tileset.editor.groups)
├── SceneEditor       — loads map, Camera (freeMode), MapChunkRenderer, clampEditorCamera
├── Renderer / Input / SceneManager / GameLoop / DebugOverlay (shared)
└── Shortcuts: B pencil, E eraser, I eyedropper, G grid, Tab toggle UI, Escape debug
```

#### Map document model
- **MapDocument** stores tile data as flat `Uint16Array` (0xffff = empty sentinel, converts to/from -1 at runtime boundary)
- Tools inject document/history via closures: `getDocument()` and `getHistory()`
- On tile edit: tool creates a command → history executes it → MapDocument emits change → MapEditorApp triggers `rebuildFullMap()`
- `rebuildFullMap()` converts MapDocument → MapData via RuntimeMapBridge, then loads tileset via TilesetRegistry

#### Map editor persistence (editor-server)
- **editor-server** (`tools/editor-server/`): Fastify on port 3032 (localhost only, CORS for local dev origins)
- **Routes**:
  - Maps: `GET /api/maps` (list), `GET /api/maps/:id` (load), `PUT /api/maps/:id` (save)
  - Tilesets: `GET /api/tilesets/:id`
  - Worlds: `GET /api/worlds` (list), `GET /api/worlds/:id` (load), `PUT /api/worlds/:id` (save), `DELETE /api/worlds/:id`
  - Project: `GET /api/project`, `PUT /api/project` (gameStart config)
- **Save flow**: `MapEditorApp.saveMap()` → PUT authored JSON to editor-server → server writes both:
  - `content/maps/.authored/{id}.json` — editor-native format (flat Uint16Array layers)
  - `content/maps/{id}.json` — runtime format (chunk-based, for client/server consumption)
- **Backups**: timestamped copies saved to `content/maps/.backup/` before each overwrite
- **Load flow**: editor-server returns authored JSON; if only runtime exists, converts via `runtimeToAuthoredJson()`
- **Codecs** (`map-codecs.js`): reuses editor's `MapSerializer` + `RuntimeMapBridge` for authored↔runtime conversion
- **Status UX**: `MapEditorState.saveStatus` (idle/saving/saved/error) → `StatusBarPanel` shows save feedback
- **Config**: `EDITOR_SERVER_ORIGIN` in `MapEditorConfig.js` (`http://localhost:3032`)
- Keyboard shortcuts: **Ctrl+Z** undo, **Ctrl+Shift+Z / Ctrl+Y** redo, **Ctrl+S** save, **Ctrl+R** reload

#### Map editor navigation
- **Pan**: Space+left drag or middle mouse drag activates temporary pan tool. Cursor changes to "move".
- **Pan speed**: PanTool divides mouse delta by `viewportScale * zoom` for 1:1 visual tracking.
- **Camera clamp**: `clampEditorCamera(camera, mapWPx, mapHPx, viewport)` allows half-viewport margin around map, so any corner can be centered on screen.
- **Pointer context**: MapEditorViewport builds `{screenX/Y, worldX/Y, tileX/Y, viewportScale}` from mouse events.

#### Map editor state flow
- MapEditorState is the single source of truth for camera position
- SceneEditor.update() clamps state.camera, then copies to visual Camera with Math.floor
- PanTool modifies state.camera directly
- ToolManager.temporaryToolId overrides state.activeTool without changing UI selection

#### Map editor lighting system
- **Data model** (`shared/data/models/LightingData.js`): `DEFAULT_LIGHTING`, `DEFAULT_LIGHT`, `normalizeLight()`, `normalizeLighting()`. Guarantees invariants and fresh references after every mutation.
- **MapDocument** stores `this.lighting` (ambient settings + `lights[]` array). CRUD methods: `createLight()`, `updateLight()`, `removeLight()`, `getLight()`, `updateLighting()`. All mutations normalize + set dirty + emit `lightingChanged`.
- **MapEditorState** holds `lightingPreview` (editor-only ambient override) and `selectedLightId`.
- **Modes**: lighting features are gated by `mode === "lights"`. Ambient overlay, gizmos, and preview halos are only visible in lights mode.
- **Panels**: `LightingPanel` — three sections: preview controls (editor state), map ambient controls (doc.updateLighting), selected light editor (doc.updateLight). Constructor pattern: `(el, state, getDocument)`.
- **Viewport interactions** (`MapEditorViewport`): click-to-create, click-to-select, drag-to-move, Delete-to-remove. `_hitTestLights()` uses circular hit with clamped pick radius (`max(10, min(radius, 24))`). Drag pattern mirrors entity drag (`_lightDrag` object with offset + preview callbacks).
- **Render overlays** (in `src/editor/workspaces/map/render/`):
  - `LightGizmoOverlay` — Container + Graphics + cached Text labels. Draws radius circles, selection ring, center markers, labels. Rebuild-on-change.
  - `LightPreviewOverlay` — Container of Sprites with shared radial gradient texture (128×128 canvas singleton). Additive blend (`blendMode = "add"`), tinted per light color, alpha from `clamp(intensity * 0.35, 0, 0.85)`. Disabled lights skipped.
  - Ambient overlay — Graphics rect fill with ambient color/alpha (resolved from preview or doc settings).
- **SceneEditor z-order** (map container children, bottom to top): ground → groundDetail → fringe → entitySpriteLayer → ambientOverlay → **lightPreviewOverlay** → entityOverlay → collisionDebug → chunkDebug → **lightGizmoOverlay**
- **Data flow**: `MapEditorApp` subscribes to `lightingChanged` events → forwards `setLights()` to SceneEditor → SceneEditor forwards to both gizmo and preview overlays. Drag preview follows same path via `onLightDragPreview`/`onLightDragClear` callbacks.
- **Serialization**: lighting passes through in `MapSerializer` and `RuntimeMapImporter`. Editor-server `map-codecs.js` preserves lighting in authored↔runtime conversion.

### World workspace (WorldEditorApp)
```
WorldEditorApp — src/editor/workspaces/world/WorldEditorApp.js
├── WorldDocument      — cell-based world data (Map<"rx,ry", {mapId}>)
│   ├── canPlaceAt()   — orthogonal adjacency constraint
│   ├── canAssignMap()  — not already used + can place
│   ├── findMapUsage() — locate map in world grid
│   └── getBounds()    — min/max rx/ry
├── WorldGridView      — Canvas 2D renderer (64px base cell, zoom 0.5–2.5)
│   ├── Occupied cells (blue) with map ID label
│   ├── Empty neighbors (dashed "+" indicators)
│   ├── Ghost preview for valid placement
│   └── Pan (middle mouse), zoom (scroll wheel), click select
├── WorldEditorState   — selectedCell, hoverCell, selectedMapId, activeTool, zoom, pan
├── WorldHistory       — undo/redo stack (assign/remove/replace/create entries)
├── WorldLibraryPanel  — map catalog list, usage indicators (dot)
├── WorldInspectorPanel — world info + cell info + action buttons
│   └── Actions: assign map, remove from world, replace, create map, open map
└── Shortcuts: F center, 1/2/3 place/replace/erase, G grid, Ctrl+Z/Y undo/redo
```

#### World document model
- Cells stored as `Map<string, { mapId }>` where key = `"rx,ry"`
- Adjacency constraint: new cells must be orthogonally connected to existing cells
- Utilities: `worldKey.js` (key encode/parse), `worldAdjacency.js` (neighbor helpers), `worldBounds.js` (bounding box)

### Database workspace (placeholder)
- `DatabaseEditorApp` — registered but shows "Coming soon"

## Server architecture (server/)

### Authoritative model
- Server owns all game state. Client sends input intentions, server computes movement/collision.
- Fixed 20 TPS tick loop (setInterval), same TICK_RATE/TICK_MS from shared Config.js.
- JSON WebSocket protocol on port 3001.

### Subsystems
```
GameServer (orchestrator) — server/src/game/GameServer.js
├── ServerLoop         — setInterval-based tick loop
├── NetworkServer      — WebSocket server (ws library)
│   └── ClientConnection — per-socket wrapper
├── SessionManager     — session ↔ connection ↔ player (dual Map lookup)
├── MovementSystem     — authoritative movement (per-axis collision resolve, tiles + solid entities)
├── CollisionSystem    — hitbox-based AABB vs collision layer tiles
├── MapTransitionSystem — detects map border crossings, updates player.mapId
├── RuntimeMapManager  — loads chunk-based maps from filesystem (+ stashes entities[])
├── RuntimeWorldManager — loads world definitions, region lookups, neighbor queries
├── PrefabRegistry     — loads entity prefabs from content/prefabs/entities/
├── ServerEntityManager — runtime entity registry (runtimeId, mapId, authoredId indexes)
└── Entity lifecycle   — spawnEntitiesForMap() / despawnEntitiesForMap()
```

### Protocol
- MSG_TYPES: hello, welcome, input, snapshot, interact, interact_result, error
- Input: seq-based dedup (accept only if seq > player.input.lastSeq, starts at -1)
- Interact: `{ type: "interact", targetId }` → server validates + responds with `interact_result`
- Snapshots: broadcast every `SNAPSHOT_INTERVAL_TICKS` (default 1 = every tick at 20 TPS)
- Snapshot payload: `{ type: "snapshot", tick, lastProcessedSeq, players: [...], entities: [...] }`
- Players: `[{ id, x, y, vx, vy, facing, mapId }]` — self always first
- Entities: `[{ id, authoredId, kind, x, y, sprite?, interactable?, solid?, hitbox?, visual? }]` — AOI-filtered
- Debug: `debugEntityHitboxes: [{ id, x, y, hitbox }]` — optional, gated by `DEBUG_SEND_ENTITY_HITBOXES`

### AOI filtering
- Configurable via `AOI_MODE` in Config.js: `"region"` | `"radius"` | `"region+radius"` (default: `"region"`)
- **Single-map mode** (no worldId): legacy filter — same mapId + radius (AOI_RADIUS = 160px)
- **World-aware mode**:
  - `"region"`: grid distance ≤ AOI_REGION_RADIUS (default 1 = 3×3 region grid)
  - `"radius"`: world-space distance ≤ AOI_RADIUS (160px = 10 tiles)
  - `"region+radius"`: both conditions (AND)
- Pre-computed caches per broadcast tick: worldDataCache + cellCache

### Input queue processing
- Client sends input every frame at 60 TPS. Server ticks at 20 TPS (~3 inputs per tick).
- `PlayerInputState` queues all received inputs (seq-deduped, capped at 120).
- `MovementSystem.update()` drains the queue per player and processes each input individually with `CLIENT_SIM_TICK_MS` (16.67ms), exactly mirroring client prediction.
- If queue is empty (network hiccup), falls back to last known input with `SERVER_TICK_MS`.
- `player.lastProcessedSeq` updated after queue drain (not on receive).
- This eliminates prediction mismatch at any server tick rate. 3 × 16.67ms ≈ 50ms = same as one server tick.

### Client prediction & reconciliation
- Client predicts locally each frame: `Player.predict(dt, input, collides)` — same logic as server MovementSystem.
- `Player.pushPendingInput(seq, input, dt)` — buffers for replay during reconciliation.
- On snapshot: `Player.reconcile(state, lastProcessedSeq, collides)` — snap to server pos, discard confirmed inputs, replay pending ones.
- **Correction smoothing**: `_renderErrorX/Y` accumulated on reconciliation (pre vs post position delta), decayed 0.5× per render frame. Threshold of 4px for teleport snap. Used by PlayerView and Camera for visual-only smoothing. Safety net for real network jitter.
- Toggled via `DEBUG_FLAGS.NET_ENABLE_CLIENT_PREDICTION` and `DEBUG_FLAGS.NET_ENABLE_RECONCILIATION`.

### Server player
- `ServerPlayer`: id, worldId, mapId, x, y (feet convention), vx, vy, facing, hitbox, input (PlayerInputState), lastProcessedSeq
- `toData()` returns snapshot-ready plain object

### Collision
- Hitbox-based (not point-based): checks all tiles covered by hitbox
- Per-axis resolution: try X then Y → wall sliding
- OOB = blocked
- Uses `TILE_SIZE` from shared Config.js

### Config (ServerConfig.js)
- tickRate, tickMs, serverName, host, port, startMapId, spawnX/Y, playerSpeed, snapshotInterval
- Factory function with overrides support

## Authored entity system

### Data model
- **Prefabs**: `content/prefabs/entities/*.json` — reusable templates with id, kind, components, params
- **Map entities**: `entities[]` array in runtime map JSON — instances with id, prefabId?, kind?, x, y, params?, components?
- **Merge**: prefab + instance → params shallow merge, components shallow per key then shallow within each component

### Server runtime
- `GameEntity` (`server/src/game/entities/`) — runtimeId ("e1"), authoredId, mapId, kind, x, y, params, components
- `ServerEntityManager` (`server/src/runtime/`) — registry indexed by runtimeId, mapId ("mapId/authoredId")
- `PrefabRegistry` (`server/src/runtime/`) — loads/caches from filesystem, graceful on missing dir
- `EntityFactory` (`server/src/runtime/`) — pure functions: resolveEntity, validateInstance, validateResolved
- Lifecycle: `spawnEntitiesForMap(mapId)` / `despawnEntitiesForMap(mapId)` on GameServer

### Snapshot replication
- Entities in `snapshot.entities[]`, AOI-filtered (same mode as players)
- `toSnapshotData()` → minimal payload (id, authoredId, kind, x, y, sprite?, interactable?, solid?, hitbox?, visual?)
- `toDebugHitboxData()` → debug-only hitbox data for solid entities (id, x, y, hitbox)
- `_toWorldEntityData()` converts map-local → world-space (same math as players)
- Client: `RemoteEntity` model (stores solid + hitbox for prediction + visual data) + `RemoteEntityView` (AnimatedSprite from `components.visual` with PLAYER_ANIMATIONS idle support, falls back to kind-based colored placeholder)

### Entity collision
- **Authored**: `components.collision = { solid: true, hitbox: { offsetX, offsetY, width, height } }`
- **Server**: `MovementSystem` checks AABB player hitbox vs solid entity hitboxes, per-axis (X then Y), same resolution as tile collision. Solid rects cached per mapId per tick via `_getSolidEntityRects()`.
- **Client prediction**: `SceneMap._collidesWithEntities()` mirrors server logic, integrated into `_collides` callback alongside tile collision. Eliminates prediction jitter.
- **Hitbox model**: AABB relative to feet position. Falls back to `DEFAULT_ENTITY_HITBOX` if missing/malformed.
- **Strict inequality**: edge contact allowed (`pRight > eLeft`, not `>=`). Non-solid entities remain passable.

### Interaction system
- **Authored**: `components.interaction = { trigger: "action", type: "text", text: "..." }`
- **Protocol**: client sends `{ type: "interact", targetId }`, server responds `{ type: "interact_result", entityId, authoredId, interactionType, text }`
- **Server validation**: `_resolveInteraction()` checks entity exists, `_isEntityRelevantToPlayer()` (same AOI as snapshots), interaction component, feet-to-feet range ≤ INTERACTION_RANGE
- **Server resolver**: `switch (interaction.type)` — currently "text" only, extensible
- **Client**: KeyE → 200ms cooldown → `_findNearestInteractable()` (feet distance) → send → `GameMessageBox.show({ text })` (promise-based, dismiss via E/Enter/Space)

## Future systems
- **Dialogue trees**: branching conversation system
- **NPC AI/movement**: entity behavior, pathfinding
- **Binary protocol**: replace JSON for bandwidth efficiency
