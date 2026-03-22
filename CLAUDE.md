# MINIMMO — Project Context

> See also: [docs/architecture.md](docs/architecture.md) (detailed subsystem docs) · [docs/memory.md](docs/memory.md) (key files index & status)

## What is this
2D MMORPG called **MINIMMO** (codename: project-hammor). Modular architecture with client, editor, server, and shared modules. Written in vanilla JavaScript with PixiJS v8 and Vite.

## Tech stack
- **PixiJS v8** (v8.17+) — NOT v7. API differences matter (no BaseTexture, no SCALE_MODES enum, use TextureSource, string scale modes).
- **Vanilla JS** — no TypeScript, no React, no frameworks.
- **Vite 8** — dev server and bundler.
- **ES Modules** — all files use `export`/`import`.

## Rendering constraints
- Tile size: **16x16**
- **Dynamic viewport**: resolution adapts to screen size via `ResolutionManager`
- Base design: ~40×22 tiles, allowed range 38–46 × 20–26
- Integer CSS scale only (2x–6x), no fractional scaling
- Overscan strategy (CSS "cover"): canvas may be slightly larger than screen, clipped by parent
- Pixel art: `roundPixels: true`, `resolution: 1`, `scaleMode: 'nearest'`
- Camera moves a root container (not individual sprites)

## Architecture overview

### Module structure
```
src/
├── shared/    Reusable by client, editor, and server
├── client/    Game runtime (PixiJS + gameplay)
├── editor/    Editor shell + workspaces (map, world, database)
└── server/    Headless server (no PixiJS)
```

### Dependency rules
- `shared/` → only `shared/` and npm packages
- `client/` → `shared/` and npm packages
- `editor/` → `shared/` and npm packages
- `server/` → `shared/core/` and `shared/data/` ONLY (never `shared/render/` or `shared/assets/`)

### Core loop
- **Fixed timestep** simulation at 20 ticks/sec (`TICK_RATE` in Config.js)
- Variable render rate (requestAnimationFrame)
- `ClientApp.update(dt)` → simulation logic
- `ClientApp.render(alpha)` → interpolated rendering
- Alpha = fractional tick progress for smooth visuals between sim ticks

### Subsystem ownership
```
ClientApp (orchestrator) — src/client/ClientApp.js
├── Renderer        — shared/render/ — PixiJS Application, dynamic viewport
│   ├── ViewportState   — plain data: scale, tiles, dimensions, offsets
│   └── ResolutionManager — pure function to compute viewport from screen size
├── Input           — shared/input/ — polling-based keyboard state
├── SceneManager    — shared/scene/ — scene stack (goto/push/pop)
├── GameLoop        — shared/core/ — fixed timestep + RAF
└── DebugOverlay    — shared/render/ — FPS/stats (Escape to toggle)
```

### Scene lifecycle
Scenes implement: `enter(engine)` → `update(dt)` → `render(alpha)` → `exit()` → `destroy()`

### Entity system
- `Entity` = pure data in `shared/data/models/`. NO Pixi imports. Tracks `x/y` (local) and `worldX/worldY` (absolute).
- `Entity.syncLocalFromWorld()` copies world coords to local (used after world-space collision).
- `EntityManager` = collection in `shared/data/models/`.
- `EntityRenderer` = syncs entity data → Pixi sprites in `shared/render/`.
- `Player extends Entity` — in `client/game/`, server-driven (no local movement).
- `Player.applyServerState(state)` — applies authoritative position from server snapshot.
- `Player.update(dt)` — ONLY saves prev positions for interpolation. No movement logic.
- `Player.hitbox` = `{ offsetX: -4, offsetY: -4, width: 8, height: 4 }` — AABB relative to **feet**.
- `PlayerView` = in `client/game/`, owns AnimatedSprite, renders with offset from feet.
- `PlayerAnimations` = animation metadata in `shared/data/models/`.
- `EntityData` = serializable snapshot in `shared/data/models/`.

### Coordinate convention ("feet")
- **`player.x, player.y` = feet = center-bottom of sprite** (not top-left).
- Server collision, client rendering, and debug all use this same reference point.
- Sprite (16x16) drawn at `(x - 8, y - 16)` — offset from feet.
- Hitbox relative to feet: `{ offsetX: -4, offsetY: -4, width: 8, height: 4 }`.
- Server `facing` (string: "down"/"left"/"right"/"up") → client `direction` (number: 0/1/2/3).

### Tile ID convention
- **`-1` = empty/invisible tile** (`EMPTY_TILE` in Config.js). Tile 0 is valid (first atlas tile).
- **0-indexed atlas**: `atlasIndex = tileId` directly. Tile 0 → atlas position 0, tile 1 → atlas position 1, etc.
- Renderers skip tiles `< 0`. Collision checks use `>= 0` (any valid tile is solid).
- Tile arrays use `Int16Array` (signed, supports -1). Initialized with `.fill(-1)`.

### Data model (shared/data/)
- `MapData` = chunk-based map data (width, height, tileSize, chunkSize, layerNames, chunks Map). Has dirty tracking (`dirtyChunks`, `markChunkDirty()`, `consumeDirty()`).
- `MapData.setTile()` returns change metadata `{ cx, cy, layerName, x, y, prev, value }` or `null` if no change.
- `MapData.getTile()` returns `-1` for out-of-bounds (not `0`).
- `ChunkData` = single chunk tile data (cx, cy, chunkSize, layers Map of Int16Array, filled with -1).
- `GameMap` = static loader facade (`GameMap.load(url)` → calls MapLoader).
- `MapLoader` = fetch JSON map + tileset metadata, build MapData with chunks.
- `TileCollision` = static AABB vs tile-layer collision check.
- `MapSerializer` = MapData ↔ JSON conversion.
- `MapValidator` = validate map integrity.

### Tilemap rendering
- `MapChunkRenderer` = chunk-based renderer, uses `VisibleChunkTracker` for enter/exit streaming. Lazy tile texture cache from atlas.
- `VisibleChunkTracker` = tracks chunk visibility changes per frame (entered, exited, visible sets). Used by MapChunkRenderer for incremental mount/hide.
- `ChunkLayerView` = Pixi Container of Sprites for one chunk's one layer. Positioned at chunk world coords.
- Layers rendered in z-order: ground → ground_detail → (entities) → fringe.
- Uses Sprites with sliced Textures from atlas (NOT Graphics objects).

### Viewport system
- `ViewportState` = plain data class (scale, tilesX/Y, widthPx/heightPx, cssWidth/Height, offsetX/Y)
- `ResolutionManager.computeViewport()` = pure function, picks highest integer scale
- `Renderer` owns the ViewportState, recomputes on resize
- `Camera` and `MapChunkRenderer` hold a reference to the same ViewportState

### Pixel-perfect rendering pipeline
- Game logic uses float positions (Entity.x/y)
- Rendering converts to integers: `Math.round` for sprite positions and camera
- Camera and sprites use the **same** rounding function (`Math.round`) to avoid 1px oscillation
- `roundPixels: true` in PixiJS provides GPU-level safety net

### Key patterns
- **Service locator**: ClientApp passes `this` to subsystems. No DI framework.
- **Data/visual separation**: Entity logic has zero Pixi imports. EntityRenderer handles all visuals.
- **Polling input**: Input state is read synchronously during update(), not via event callbacks.
- **Interpolation**: Entities store `prevX/prevY`. Render uses `prev + (curr - prev) * alpha`.
- **Shared viewport reference**: Camera and MapChunkRenderer hold a reference to Renderer's ViewportState.

## File structure
```
src/
├── client/
│   ├── main.js              Entry point
│   ├── ClientApp.js          Orchestrator (loads ProjectSettings, passes gameStart to SceneMap)
│   ├── game/
│   │   ├── Player.js         Player entity (server-driven, applyServerState, feet convention)
│   │   └── PlayerView.js     Player sprite (AnimatedSprite, offset from feet)
│   ├── network/
│   │   └── NetworkManager.js Client WebSocket (hello, input, welcome, snapshot)
│   ├── world/
│   │   ├── WorldData.js      Loads world JSON, indexes maps by region and mapId
│   │   └── LoadedRegion.js   Wraps MapData + MapChunkRenderer with world offset
│   ├── render/
│   │   ├── ChunkDebugOverlay.js    Tile grid + chunk boundary debug lines
│   │   ├── HitboxDebugOverlay.js   Entity hitbox debug rectangles
│   │   └── TileLayerDebugOverlay.js  Collision layer debug highlight
│   └── scenes/
│       └── SceneMap.js       Main gameplay scene (world streaming, multi-region)
├── editor/
│   ├── main.js              Editor entry point (registers workspaces, switches to map)
│   ├── shared/styles/
│   │   └── global.css       Global fonts, resets, root layout
│   ├── shell/
│   │   ├── EditorShell.js   Top-level shell (tabs, workspace lifecycle, Ctrl+S delegation, confirm dialogs)
│   │   ├── DialogHost.js    Promise-based confirm dialog (mounted in .editor-dialog-layer)
│   │   ├── ShellState.js    Active workspace ID, pub-sub
│   │   ├── WorkspaceRegistry.js  Factory registry for workspace creation
│   │   └── styles/
│   │       ├── shell.css    Topbar + tabs styling
│   │       └── dialogs.css  Confirm dialog overlay + card styling
│   └── workspaces/
│       ├── map/                        Map editor workspace (PixiJS-based tile editor)
│       │   ├── MapEditorApp.js         Workspace orchestrator (Renderer + Tools + Panels)
│       │   ├── MapEditorLayout.js      HTML layout (viewport, toolbar, panels, status bar)
│       │   ├── MapEditorState.js       Central state (tool, layer, camera, map, brush, etc.)
│       │   ├── MapEditorViewport.js    Canvas mouse/keyboard events → ToolManager
│       │   ├── MapEditorConfig.js      EDITOR_SERVER_ORIGIN constant
│       │   ├── document/
│       │   │   ├── MapDocument.js        Authoring data (Uint16Array flat, events, write-lock)
│       │   │   ├── MapSerializer.js      MapDocument ↔ JSON
│       │   │   └── RuntimeMapImporter.js Runtime MapData → MapDocument
│       │   ├── history/
│       │   │   ├── History.js            Undo/redo stack (command pattern)
│       │   │   └── commands/
│       │   │       ├── PaintTilesCommand.js  Forward + inverse tile paint
│       │   │       └── EraseTilesCommand.js  Sets tiles to -1
│       │   ├── runtime/
│       │   │   └── RuntimeMapBridge.js   MapDocument → MapData (full rebuild)
│       │   ├── scenes/
│       │   │   └── SceneEditor.js    Main editor scene (map + camera + chunk renderer)
│       │   ├── tools/
│       │   │   ├── ToolManager.js    Tool registry + temporary tool support
│       │   │   ├── PanTool.js        Camera drag (accounts for viewport.scale)
│       │   │   ├── PencilTool.js     Paint tiles (via PaintTilesCommand)
│       │   │   ├── EraseTool.js      Erase tiles (via EraseTilesCommand)
│       │   │   └── EyedropperTool.js Pick tile from map, auto-switch to pencil
│       │   ├── panels/
│       │   │   ├── ToolbarPanel.js   Top toolbar
│       │   │   ├── ToolsPanel.js     Tool selector
│       │   │   ├── LayersPanel.js    Layer visibility
│       │   │   ├── TilesPanel.js     Tile group selector + tile picker grid
│       │   │   └── StatusBarPanel.js Bottom status bar
│       │   ├── utils/
│       │   │   └── clampEditorCamera.js  Editor camera clamp (half-viewport margins)
│       │   └── styles/map-editor.css     Map editor layout + panels
│       ├── world/                        World editor workspace (Canvas 2D grid)
│       │   ├── WorldEditorApp.js         Workspace orchestrator (grid + panels + history)
│       │   ├── WorldDocument.js          Cell-based world data (Map<"rx,ry", {mapId}>)
│       │   ├── WorldGridView.js          Canvas 2D grid renderer (cells, adjacency, zoom/pan)
│       │   ├── WorldEditorState.js       View state (selection, hover, zoom, pan, tool)
│       │   ├── WorldHistory.js           Undo/redo stack (before/after cell entries)
│       │   ├── panels/
│       │   │   ├── WorldLibraryPanel.js  Map catalog + usage indicators
│       │   │   └── WorldInspectorPanel.js  World/cell info + action buttons
│       │   ├── utils/
│       │   │   ├── worldKey.js           "rx,ry" key encoding/parsing
│       │   │   ├── worldAdjacency.js     Orthogonal neighbor helpers
│       │   │   └── worldBounds.js        Bounding box computation
│       │   └── styles/world-editor.css   3-column layout + grid styling
│       └── database/
│           └── DatabaseEditorApp.js      Placeholder workspace (coming soon)
├── server/                   (under project root, NOT src/server/)
│   └── src/
│       ├── index.js              Server entrypoint with graceful shutdown
│       ├── config/
│       │   └── ServerConfig.js   Config factory (tickRate, spawn, speed, snapshotInterval)
│       ├── game/
│       │   ├── GameServer.js     Central orchestrator (loop, network, sessions, players)
│       │   ├── ServerLoop.js     Fixed-timestep loop (setInterval)
│       │   ├── SessionManager.js Session CRUD (dual Map: byId + byConnectionId)
│       │   ├── entities/
│       │   │   └── ServerPlayer.js  Server player (position, velocity, facing, hitbox, input)
│       │   ├── input/
│       │   │   └── PlayerInputState.js  Last known input per player (seq-based dedup)
│       │   └── systems/
│       │       ├── MovementSystem.js    Authoritative movement (diagonal norm, per-axis resolve)
│       │       └── CollisionSystem.js   Hitbox-based collision against map tiles
│       ├── network/
│       │   ├── NetworkServer.js         WebSocket server (ws library)
│       │   ├── ClientConnection.js      Individual socket wrapper
│       │   └── protocols/
│       │       └── messages.js          MSG_TYPES, parseMessage, validateInput, createMessage
│       └── runtime/
│           └── RuntimeMapManager.js     Loads chunk-based maps from filesystem
└── shared/
    ├── core/
    │   ├── Config.js         All constants (TILE_SIZE, EMPTY_TILE, TICK_RATE, etc.)
    │   └── GameLoop.js       Fixed timestep loop
    ├── input/
    │   └── Input.js          Polling-based keyboard state (shared by client + editor)
    ├── world/
    │   └── WorldMath.js      makeRegionKey, worldToRegion, regionToWorldOffset
    ├── render/
    │   ├── Renderer.js       PixiJS Application wrapper
    │   ├── Camera.js         Viewport follow/clamp + debug free mode + setWorldBounds()
    │   ├── ViewportState.js  Viewport data
    │   ├── ResolutionManager.js  Viewport computation
    │   ├── MapChunkRenderer.js   Chunk-based tile rendering (Sprites)
    │   ├── VisibleChunkTracker.js  Chunk enter/exit diff tracking
    │   ├── ChunkLayerView.js     Single chunk+layer Sprite container
    │   ├── TilemapRenderer.js    Legacy tile rendering (Graphics pool)
    │   ├── EntityRenderer.js     Entity→sprite sync
    │   └── DebugOverlay.js       FPS/stats overlay
    ├── scene/
    │   ├── Scene.js          Base class
    │   └── SceneManager.js   Scene stack
    ├── assets/
    │   ├── AssetsManager.js  PixiJS Assets wrapper
    │   ├── AssetManifest.js  Bundle definitions
    │   └── SpriteSheetSlicer.js  Texture slicing
    └── data/
        ├── TileCollision.js       AABB vs tile-layer collision
        ├── models/
        │   ├── Entity.js          Base entity data
        │   ├── EntityManager.js   Entity registry
        │   ├── EntityData.js      Serializable snapshot
        │   ├── PlayerAnimations.js  Animation metadata
        │   ├── MapData.js         Chunk-based map data
        │   ├── ChunkData.js       Single chunk tile data
        │   ├── LayerData.js       Single tile layer (legacy)
        │   └── GameMap.js         Static loader facade
        ├── loaders/MapLoader.js        Fetch JSON maps + tileset
        ├── loaders/TilesetRegistry.js  Cached tileset metadata loader (shared by editor + client)
        ├── loaders/ProjectSettings.js  Loads /content/project.json (gameStart config)
        ├── serializers/MapSerializer.js  MapData ↔ JSON
        └── validators/MapValidator.js    Map validation

content/
├── project.json    Bootstrap config (gameStart: worldId, mapId, x, y)
├── atlas/          Tileset atlas images (webp)
├── maps/           Runtime map JSON files (generated by editor-server)
│   ├── .authored/  Editor-authored map JSON (source of truth for editor)
│   └── .backup/    Timestamped backups before each save
├── worlds/         Runtime world JSON files
│   ├── .authored/  Editor-authored world JSON (source of truth)
│   └── .backup/    Timestamped backups before each save
├── tilesets/        Tileset metadata JSON
├── sprites/
│   ├── characters/  Player/NPC sprites
│   ├── effects/     Effect sprites
│   └── monsters/    Monster sprites
├── dialogue/        Dialogue data
├── interactions/    Interaction definitions
├── items/           Item definitions
├── npcs/            NPC definitions
├── objects/         World object definitions
└── skills/          Skill definitions

tools/
└── editor-server/              Local dev server for editor save/load
    ├── package.json            Fastify dependency
    └── src/
        ├── server.js           Fastify app (port 3032, localhost CORS)
        ├── routes/
        │   ├── maps.js         GET/PUT /api/maps/:id — list, load, save
        │   ├── tilesets.js     GET /api/tilesets/:id
        │   ├── worlds.js      GET/PUT/DELETE /api/worlds/:id — list, load, save, delete
        │   └── project.js     GET/PUT /api/project — project.json config
        └── lib/
            ├── map-codecs.js   authored↔runtime map conversion
            ├── world-codecs.js authored↔runtime world conversion
            ├── fs-utils.js     File I/O helpers (backup, ensureDir, readJson, writeJson)
            └── paths.js        Content directory path resolution (maps, worlds, project)
```

## Conventions
- Keep entities engine-agnostic (no pixi imports in shared/data/).
- Data models live in `shared/data/`, rendering in `shared/render/`.
- Client-specific gameplay goes in `client/game/`.
- Scene classes should clean up all Pixi objects in destroy().
- Config.js holds all magic numbers as named exports.
- Spanish comments are OK (original dev language).
- Asset bundles are organized by scene/area, not by type.
- Use `Math.round` for all render-time position rounding (sprites AND camera). Never `Math.floor` (causes subpixel jitter).
- Server code must NEVER import from `shared/render/` or `shared/assets/`.
- **JSDoc on every method**: all public methods must have a JSDoc comment explaining what they do. If a method doesn't have one, add it. Include `@param` and `@returns` where applicable.
- **Coordinate convention**: `player.x, player.y` = feet (center-bottom of sprite). All systems (server, client, debug) use this reference.

## Important PixiJS v8 notes
- `Application.init()` is async — must await before using stage/canvas.
- Use `TextureSource.defaultOptions.scaleMode = 'nearest'` (not BaseTexture).
- `roundPixels: true` in app init prevents pixel art shimmering.
- `resolution: 1` because we CSS-scale — don't use devicePixelRatio.
- Graphics objects are expensive (each = draw call). Prefer Sprites with shared textures.
- `app.renderer.resize(w, h)` to change internal resolution dynamically.

### Editor shell + workspaces
```
EditorShell (top-level) — src/editor/shell/EditorShell.js
├── ShellState        — active workspace ID, pub-sub
├── WorkspaceRegistry — factory map, creates workspace on tab switch
├── DialogHost        — Promise-based confirm dialog (shell-level, .editor-dialog-layer)
├── Ctrl+S delegation — routes to active workspace's save() if canSave()
├── Editor API        — { confirm } passed to workspaces on mount (not the full shell)
└── Workspaces:
    ├── MapEditorApp (map workspace) — src/editor/workspaces/map/MapEditorApp.js
    │   ├── MapEditorLayout   — HTML layout (viewport, toolbar, panels, status bar)
    │   ├── MapEditorState    — central state (tool, layer, camera, map, saveStatus)
    │   ├── MapDocument       — authoring data (Uint16Array flat, 0xffff=empty)
    │   ├── History           — undo/redo command stack
    │   │   ├── PaintTilesCommand — forward + inverse tile changes
    │   │   └── EraseTilesCommand — sets tiles to -1
    │   ├── RuntimeMapBridge  — MapDocument → MapData (full rebuild)
    │   ├── MapEditorViewport — canvas mouse/keyboard → ToolManager
    │   │   └── Temporary pan: Space+left drag or middle mouse drag
    │   ├── ToolManager       — tool registry, temporaryToolId
    │   │   ├── PanTool / PencilTool / EraseTool / EyedropperTool
    │   ├── Panels            — ToolbarPanel, ToolsPanel, LayersPanel, StatusBarPanel, TilesPanel
    │   ├── SceneEditor       — map loading, chunk renderer, camera clamp
    │   ├── MapEditorConfig   — EDITOR_SERVER_ORIGIN (http://localhost:3032)
    │   ├── TilesetRegistry   — shared/data/loaders/ — cached tileset metadata
    │   ├── Renderer / Input / SceneManager / GameLoop / DebugOverlay (shared)
    │   └── Shortcuts: B pencil, E eraser, I eyedropper, G grid, Tab toggle UI, Escape debug
    ├── WorldEditorApp (world workspace) — src/editor/workspaces/world/WorldEditorApp.js
    │   ├── WorldDocument     — cell-based world data (Map<"rx,ry", {mapId}>)
    │   │   └── Adjacency constraint: cells must be orthogonally connected
    │   ├── WorldGridView     — Canvas 2D renderer (cells, neighbors, zoom/pan, ghost preview)
    │   ├── WorldEditorState  — selection, hover, zoom, pan, activeTool
    │   ├── WorldHistory      — undo/redo (assign/remove/replace/create entries)
    │   ├── WorldLibraryPanel — map catalog with usage indicators
    │   ├── WorldInspectorPanel — world/cell info + action buttons
    │   └── Shortcuts: F center, 1/2/3 tools, G grid, Ctrl+Z/Y undo/redo
    └── DatabaseEditorApp (placeholder) — coming soon
```

### Editor persistence (editor-server)
- **Save flow**: Ctrl+S → shell delegates to workspace → PUT to editor-server (port 3032)
- **Dual-format write**: server saves authored JSON to `.authored/` + runtime JSON to parent dir (maps and worlds)
- **Backups**: timestamped copies in `.backup/` before each overwrite
- **Load flow**: editor-server GET returns authored JSON (converts from runtime if no authored exists)
- **Status UX**: `MapEditorState.saveStatus` drives StatusBarPanel display (saving → saved → idle, or error)
- **Map codecs**: `map-codecs.js` uses `MapSerializer` + `RuntimeMapBridge` for authored↔runtime conversion
- **World codecs**: `world-codecs.js` converts cell-based authored format ↔ maps-array runtime format
- **Project config**: GET/PUT `/api/project` for `project.json` (gameStart settings)

### Editor navigation
- **Pan**: Space+left drag or middle mouse drag activates temporary pan (doesn't change UI-selected tool)
- **Cursor**: changes to "move" during pan, restores after
- **Camera clamp**: `clampEditorCamera()` allows half-viewport margin around map (any corner can be centered)
- **Pan speed**: PanTool divides mouse delta by `viewportScale * zoom` for 1:1 visual movement

## World streaming (client)

### Bootstrap
1. `ClientApp.start()` loads `ProjectSettings` from `/content/project.json`
2. `gameStart` config specifies `{ worldId?, mapId, x, y }` — determines spawn point
3. If `worldId` is set, `WorldData.load()` fetches `/content/worlds/{id}.json`
4. `SceneMap` receives `gameStart` + `worldData` in constructor

### Region model
- `WorldData` indexes maps by region coords (`_byRegion`) and by mapId (`_byMapId`)
- `LoadedRegion` wraps MapData + MapChunkRenderer with world-space offset (`offsetX`, `offsetY`)
- `WorldMath` (`shared/world/`): `makeRegionKey(rx,ry)`, `worldToRegion()`, `regionToWorldOffset()`
- `regionPixelWidth/Height` = `worldData.regionWidth * TILE_SIZE`

### Streaming logic (SceneMap)
- Player position → region coords via `worldToRegion()`
- `_syncRegions(rx, ry)` on region change:
  - **Load set** (radius 1 = 3×3): ensures regions are loaded via `_ensureRegionLoaded()`
  - **Keep set** (radius 2 = 5×5): hysteresis to prevent thrashing near boundaries
  - Unloads only regions outside keep set (and not mid-load)
- `_loadingKeys` Set prevents duplicate async loads and premature unloads
- Layer containers per region are added/removed from shared ground/detail/fringe layers

### World-aware collision
- `_collidesAtWorld(worldX, worldY, hitbox)` checks all affected regions
- Hitbox corners → region grid → each region's collision layer
- Unloaded regions return true (collision fail-safe)
- Player uses `collisionResolver` callback delegated by SceneMap

### World-aware camera
- `Camera.setWorldBounds(left, top, right, bottom)` clamps to total world extent
- `_computeWorldBounds()` calculates from all map entries in worldData

## Server architecture

### Authoritative model
- Server owns all game state. Client sends input intentions, server computes movement/collision.
- Fixed 20 TPS tick loop (setInterval). Same `TICK_RATE`/`TICK_MS` as client (from shared Config.js).
- JSON WebSocket protocol: `hello` → `welcome`, `input` → server processes, `snapshot` → broadcast.

### Server subsystems
```
GameServer (orchestrator) — server/src/game/GameServer.js
├── ServerLoop         — setInterval tick loop
├── NetworkServer      — WebSocket server (ws library, port 3001)
│   └── ClientConnection — per-socket wrapper (id, send, close)
├── SessionManager     — session ↔ connection ↔ player mapping
├── MovementSystem     — authoritative movement (speed, diagonal normalization, per-axis collision)
├── CollisionSystem    — hitbox-based AABB vs collision layer tiles
└── RuntimeMapManager  — loads chunk-based maps from filesystem (content/maps/)
```

### Protocol (messages.js)
- `MSG_TYPES`: hello, welcome, input, snapshot, error
- `parseMessage(raw)` — JSON parse + type validation
- `validateInput(msg)` — seq (non-negative int), input (4 boolean flags)
- `createMessage(type, data)` — factory

### Snapshot system
- Server broadcasts snapshots every `snapshotInterval` ticks (default 3 = ~150ms)
- Snapshot: `{ type: "snapshot", tick, players: [{ id, x, y, vx, vy, facing, mapId }] }`
- Client `NetworkManager` receives snapshot, finds self by `serverId`, calls `Player.applyServerState()`

### Input flow
- Client detects input change (compare with last sent) → `NetworkManager.sendInput({up,down,left,right})`
- Server validates (seq-based dedup, all 4 flags boolean) → `PlayerInputState.apply()`
- MovementSystem reads input each tick → computes movement → CollisionSystem validates

### Collision (server)
- Hitbox-based: checks all tiles covered by player hitbox (not just a point)
- Per-axis resolution: try X first, then Y → allows wall sliding
- OOB = blocked (out-of-bounds tiles are solid)
- Uses shared `TILE_SIZE` from Config.js

### Client networking
- `NetworkManager` (`src/client/network/`): minimal WebSocket wrapper, callbacks for welcome/snapshot
- `SceneMap` creates NetworkManager, wires callbacks, sends input changes
- Player position comes EXCLUSIVELY from server snapshots (no local movement)

## Future systems (not yet implemented)
- **Client-side prediction**: predict movement locally, reconcile with server snapshots.
- **NPC/Monster entities**: Same entity system, different update logic.
- **Binary protocol**: Replace JSON with binary for bandwidth efficiency.

## Debug
- `Escape` toggles debug overlay (starts hidden). Shows: FPS, camera pos, player pos, chunk pos, entity count, viewport info, canvas size, container size.
- Debug overlays (all toggle with Escape): collision layer highlight (red), entity hitbox (cyan), tile grid (blue) + chunk boundaries (red).
- Camera debug: IJKL enters free camera mode, WASD returns to player follow.
- `window.__engine` available in dev mode (Vite DEV).
- `__engine.renderer.viewport` to inspect current viewport state from console.
