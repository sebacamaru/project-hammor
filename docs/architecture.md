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
1. Renderer.init() — compute viewport, create Pixi app at dynamic resolution, append canvas, setup resize
2. AssetManager.init() — register manifest
3. AssetManager.loadBundle('core') — load textures
4. new Input() — bind keyboard listeners
5. new SceneManager() — empty stack
6. new DebugOverlay() — attach to stage (starts hidden)
7. new GameLoop(clientApp) — ready but not running
8. SceneManager.goto(SceneMap) — enter first scene
9. GameLoop.start() — begin RAF

## Data flow per frame
```
RAF tick
├── accumulator += frameTime
├── while (accumulator >= TICK_MS):
│   ├── Input.poll()
│   ├── SceneManager.update(dt)
│   │   └── SceneMap.update(dt)
│   │       ├── Player.update(dt, input, map) — movement + tile collision
│   │       ├── EntityManager.updateAll(dt, input)
│   │       ├── Camera debug mode check (IJKL → free, WASD → follow)
│   │       └── Debug info update (cam, player, chunk, entities, viewport)
│   └── accumulator -= TICK_MS
├── alpha = accumulator / TICK_MS
└── ClientApp.render(alpha)
    ├── SceneManager.render(alpha)
    │   └── SceneMap.render(alpha)
    │       ├── Camera.renderUpdate(player, alpha) — interpolate + recalc bounds
    │       ├── root.x/y = -camera (already floor-snapped)
    │       ├── MapChunkRenderer.update(camera) — show/hide chunk views
    │       ├── Debug overlays: collision, chunk grid, hitbox
    │       ├── EntityRenderer.sync(entities, alpha) — floor-snapped interpolation
    │       └── PlayerView.updateFromEntity(player, alpha) — floor-snapped interpolation
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
- TILE_SIZE = 16
- EMPTY_TILE = -1
- BASE_TILES_X = 40, BASE_TILES_Y = 22
- MIN_SCALE = 2, MAX_SCALE = 6
- MIN_TILES_X = 38, MAX_TILES_X = 46
- MIN_TILES_Y = 20, MAX_TILES_Y = 26
- TICK_RATE = 20, TICK_MS = 50

## Scene lifecycle
- enter(engine) — create containers, load map, setup entities, pass viewport to Camera/MapChunkRenderer, add to stage
- update(dt) — game logic, entity updates, camera debug mode
- render(alpha) — camera interpolation, visual sync, chunk rendering, entity interpolation
- exit() — remove containers from stage
- destroy() — destroy all Pixi objects, clear references

## Entity system design

### Data layer (shared/data/models/)
- **Entity**: pure data object (id, x, y, prevX, prevY, direction, speed, type). Auto-increment ID.
- **EntityManager**: Map<id, Entity>, add/remove/get/getAll/updateAll
- **EntityData**: serializable snapshot for network/persistence, with fromEntity()/toPlain()/fromPlain()
- **PlayerAnimations**: animation name → { row, speed } mapping + DIRECTION_NAMES array

### Client gameplay (client/game/)
- **Player extends Entity**: adds input-driven movement, normalized diagonal, hitbox-based tile collision (per-axis resolve)
- **Player.hitbox**: `{ offsetX: 4, offsetY: 12, width: 8, height: 4 }` — AABB relative to entity position
- **PlayerView**: owns AnimatedSprite, animation map from spritesheet, updates from Player state

### Render layer (shared/render/)
- **EntityRenderer**: Map<id, Sprite>, creates sprites on first sync, interpolates with Math.floor
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

## Debug overlays (client/render/)
- **ChunkDebugOverlay**: blue tile grid lines + red chunk boundary lines (2px). Uses Graphics.rect + fill.
- **TileLayerDebugOverlay**: highlights tiles in a named layer (used for collision). Configurable color.
- **HitboxDebugOverlay**: renders entity hitbox as cyan rectangle.
- All toggle with Escape (sync with `engine.debug.visible`).

## Pixel-perfect rendering rules
- All render-time positions use `Math.floor` (sprites AND camera)
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
├── Tab bar            — one tab per registered workspace
└── Ctrl+S delegation  — routes to active workspace's save() if canSave()
```

**Workspace interface**: `mount(host)`, `unmount()`, `resize()`, `update(dt)`, `canSave()`, `save()`, `getTitle()`

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
├── Panels            — ToolbarPanel, ToolsPanel, LayersPanel, StatusBarPanel, TilesPanel
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
- **Routes**: `GET /api/maps` (list), `GET /api/maps/:id` (load), `PUT /api/maps/:id` (save), `GET /api/tilesets/:id`
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

## Server architecture (skeleton)
- **ServerApp**: setInterval-based tick loop (no RAF). Imports only shared/core/ and shared/data/.
- **WorldMap**: wraps MapData, provides server-specific queries (isWalkable stub)
- **ServerMapLoader**: reads JSON from filesystem via Node.js fs → MapSerializer.deserialize()

## Future networking plan
- Fixed 20Hz tick matches planned server tick rate
- Entity IDs already assigned (auto-increment, will switch to server-assigned)
- prevX/prevY interpolation works for both local prediction and server state
- Plan: send input intents to server, apply client-side prediction, reconcile with server state
- EntityData provides the serializable snapshot format for network messages
