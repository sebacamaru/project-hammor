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
- **MapData**: width, height, tileSize, chunkSize, layerNames, chunks Map<string, ChunkData>. getTile/setTile delegate to chunks via worldToChunk().
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
{ "image": "atlas_world", "tileSize": 16, "columns": 32 }
```

## Tilemap rendering (chunk-based)
- **MapChunkRenderer**: manages ChunkLayerViews for visible chunks. One Container per layer for z-order control.
  - Determines visible chunks from camera position + viewport size
  - Lazily creates ChunkLayerView when chunk enters view for first time
  - Hides (visible=false) chunk views that leave the viewport
  - Tracks empty chunk+layer combos to skip re-checking
  - Caches tile Textures (sliced from atlas) in a Map<tileId, Texture>
  - `rebuildChunk(cx, cy)` for editor/dynamic tile changes
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

## Editor architecture
```
EditorApp (orchestrator) — src/editor/EditorApp.js
├── EditorShell       — HTML layout (toolbar, viewport, side panels, status bar)
├── EditorState       — central state: activeTool, activeLayer, visibleLayers,
│                       selectedBrush, camera {x,y,zoom}, map, hoverTile, dirty
├── EditorViewport    — canvas mouse/keyboard events → pointer context → ToolManager
│   └── Temporary pan activation: Space+left drag or middle mouse drag
├── ToolManager       — tool registry, temporaryToolId for transient tool switching
│   ├── PanTool       — camera drag (compensates viewport.scale * zoom)
│   ├── PencilTool    — paint selected tile on active layer
│   └── EraseTool     — set tile to -1 on active layer
├── Panels            — ToolbarPanel, ToolsPanel, LayersPanel, StatusBarPanel
├── SceneEditor       — loads map, Camera (freeMode), MapChunkRenderer, clampEditorCamera
├── Renderer          — shared, PixiJS Application + dynamic viewport
├── Input             — shared, polling-based keyboard state
├── SceneManager      — shared, scene stack
├── GameLoop          — shared, fixed timestep + RAF
└── DebugOverlay      — shared, FPS/stats (Escape to toggle)
```

### Editor navigation
- **Pan**: Space+left drag or middle mouse drag activates temporary pan tool. Cursor changes to "move".
- **Pan speed**: PanTool divides mouse delta by `viewportScale * zoom` for 1:1 visual tracking.
- **Camera clamp**: `clampEditorCamera(camera, mapWPx, mapHPx, viewport)` allows half-viewport margin around map, so any corner can be centered on screen.
- **Pointer context**: EditorViewport builds `{screenX/Y, worldX/Y, tileX/Y, viewportScale}` from mouse events.

### Editor state flow
- EditorState is the single source of truth for camera position
- SceneEditor.update() clamps state.camera, then copies to visual Camera with Math.floor
- PanTool modifies state.camera directly
- ToolManager.temporaryToolId overrides state.activeTool without changing UI selection

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
