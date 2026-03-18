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
├── editor/    Map editor (PixiJS + editing tools)
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
- `Entity` = pure data in `shared/data/models/`. NO Pixi imports.
- `EntityManager` = collection in `shared/data/models/`.
- `EntityRenderer` = syncs entity data → Pixi sprites in `shared/render/`.
- `Player extends Entity` — in `client/game/`, reads input + tile collision in update().
- `Player.hitbox` = `{ offsetX, offsetY, width, height }` for AABB collision.
- `PlayerView` = in `client/game/`, owns AnimatedSprite.
- `PlayerAnimations` = animation metadata in `shared/data/models/`.
- `EntityData` = serializable snapshot in `shared/data/models/`.

### Tile ID convention
- **`-1` = empty/invisible tile** (`EMPTY_TILE` in Config.js). Tile 0 is valid (first atlas tile).
- **0-indexed atlas**: `atlasIndex = tileId` directly. Tile 0 → atlas position 0, tile 1 → atlas position 1, etc.
- Renderers skip tiles `< 0`. Collision checks use `>= 0` (any valid tile is solid).
- Tile arrays use `Int16Array` (signed, supports -1). Initialized with `.fill(-1)`.

### Data model (shared/data/)
- `MapData` = chunk-based map data (width, height, tileSize, chunkSize, layerNames, chunks Map).
- `ChunkData` = single chunk tile data (cx, cy, chunkSize, layers Map of Int16Array, filled with -1).
- `GameMap` = static loader facade (`GameMap.load(url)` → calls MapLoader).
- `MapLoader` = fetch JSON map + tileset metadata, build MapData with chunks.
- `TileCollision` = static AABB vs tile-layer collision check.
- `MapSerializer` = MapData ↔ JSON conversion.
- `MapValidator` = validate map integrity.

### Tilemap rendering
- `MapChunkRenderer` = chunk-based renderer, creates/hides ChunkLayerViews per visible chunk+layer. Lazy tile texture cache from atlas.
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
- Rendering converts to integers: `Math.floor` for sprite positions and camera
- Camera and sprites use the **same** rounding function (`Math.floor`) to avoid 1px oscillation
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
│   ├── ClientApp.js          Orchestrator (was Engine.js)
│   ├── input/                (empty — Input moved to shared/input/)

│   ├── game/
│   │   ├── Player.js         Player entity (extends Entity, has hitbox + collision)
│   │   └── PlayerView.js     Player sprite (AnimatedSprite)
│   ├── render/
│   │   ├── ChunkDebugOverlay.js    Tile grid + chunk boundary debug lines
│   │   ├── HitboxDebugOverlay.js   Entity hitbox debug rectangles
│   │   └── TileLayerDebugOverlay.js  Collision layer debug highlight
│   └── scenes/
│       └── SceneMap.js       Main gameplay scene
├── editor/
│   ├── main.js              Editor entry point
│   ├── EditorApp.js          Editor orchestrator (Renderer + SceneManager + Tools + Panels)
│   ├── EditorShell.js        HTML layout (toolbar, viewport, panels, status bar)
│   ├── EditorState.js        Central state (tool, layer, camera, map, brush, etc.)
│   ├── EditorViewport.js     Canvas mouse/keyboard events → ToolManager
│   ├── scenes/
│   │   └── SceneEditor.js    Main editor scene (map + camera + chunk renderer)
│   ├── tools/
│   │   ├── ToolManager.js    Tool registry + temporary tool support
│   │   ├── PanTool.js        Camera drag (accounts for viewport.scale)
│   │   ├── PencilTool.js     Paint tiles
│   │   └── EraseTool.js      Erase tiles (sets to -1)
│   ├── panels/
│   │   ├── ToolbarPanel.js   Top toolbar
│   │   ├── ToolsPanel.js     Tool selector
│   │   ├── LayersPanel.js    Layer visibility
│   │   └── StatusBarPanel.js Bottom status bar
│   └── utils/
│       └── clampEditorCamera.js  Editor camera clamp (half-viewport margins)
├── server/
│   ├── ServerApp.js          Headless tick loop (no PixiJS)
│   ├── world/WorldMap.js     Server map wrapper
│   └── loaders/ServerMapLoader.js  Load maps from fs
└── shared/
    ├── core/
    │   ├── Config.js         All constants (TILE_SIZE, EMPTY_TILE, TICK_RATE, etc.)
    │   └── GameLoop.js       Fixed timestep loop
    ├── input/
    │   └── Input.js          Polling-based keyboard state (shared by client + editor)
    ├── render/
    │   ├── Renderer.js       PixiJS Application wrapper
    │   ├── Camera.js         Viewport follow/clamp + debug free mode
    │   ├── ViewportState.js  Viewport data
    │   ├── ResolutionManager.js  Viewport computation
    │   ├── MapChunkRenderer.js   Chunk-based tile rendering (Sprites)
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
        ├── serializers/MapSerializer.js  MapData ↔ JSON
        └── validators/MapValidator.js    Map validation

content/
├── atlas/          Tileset atlas images (webp)
├── maps/           Map JSON files
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
```

## Conventions
- Keep entities engine-agnostic (no pixi imports in shared/data/).
- Data models live in `shared/data/`, rendering in `shared/render/`.
- Client-specific gameplay goes in `client/game/`.
- Scene classes should clean up all Pixi objects in destroy().
- Config.js holds all magic numbers as named exports.
- Spanish comments are OK (original dev language).
- Asset bundles are organized by scene/area, not by type.
- Use `Math.floor` for all render-time position rounding (sprites AND camera). Never `Math.round`.
- Server code must NEVER import from `shared/render/` or `shared/assets/`.

## Important PixiJS v8 notes
- `Application.init()` is async — must await before using stage/canvas.
- Use `TextureSource.defaultOptions.scaleMode = 'nearest'` (not BaseTexture).
- `roundPixels: true` in app init prevents pixel art shimmering.
- `resolution: 1` because we CSS-scale — don't use devicePixelRatio.
- Graphics objects are expensive (each = draw call). Prefer Sprites with shared textures.
- `app.renderer.resize(w, h)` to change internal resolution dynamically.

### Editor subsystem ownership
```
EditorApp (orchestrator) — src/editor/EditorApp.js
├── EditorShell       — editor/ — HTML layout (toolbar, viewport, panels)
├── EditorState       — editor/ — central state (tool, layer, camera, map)
├── EditorViewport    — editor/ — canvas mouse/keyboard → ToolManager
│   └── Temporary pan: Space+left drag or middle mouse drag
├── ToolManager       — editor/tools/ — tool registry, temporaryToolId
│   ├── PanTool       — camera drag (compensates viewport.scale)
│   ├── PencilTool    — paint selected tile
│   └── EraseTool     — set tile to -1
├── SceneEditor       — editor/scenes/ — map loading, chunk renderer, camera clamp
├── Renderer          — shared/render/ — PixiJS Application, dynamic viewport
├── Input             — shared/input/ — polling-based keyboard state
├── SceneManager      — shared/scene/ — scene stack
├── GameLoop          — shared/core/ — fixed timestep + RAF
└── DebugOverlay      — shared/render/ — FPS/stats (Escape to toggle)
```

### Editor navigation
- **Pan**: Space+left drag or middle mouse drag activates temporary pan (doesn't change UI-selected tool)
- **Cursor**: changes to "move" during pan, restores after
- **Camera clamp**: `clampEditorCamera()` allows half-viewport margin around map (any corner can be centered)
- **Pan speed**: PanTool divides mouse delta by `viewportScale * zoom` for 1:1 visual movement

## Future systems (not yet implemented)
- **Networking**: WebSocket connection, binary protocol. Client-side prediction + server reconciliation.
- **NPC/Monster entities**: Same entity system, different update logic.
- **Server networking**: Real WebSocket server with Colyseus or custom.

## Debug
- `Escape` toggles debug overlay (starts hidden). Shows: FPS, camera pos, player pos, chunk pos, entity count, viewport info, canvas size, container size.
- Debug overlays (all toggle with Escape): collision layer highlight (red), entity hitbox (cyan), tile grid (blue) + chunk boundaries (red).
- Camera debug: IJKL enters free camera mode, WASD returns to player follow.
- `window.__engine` available in dev mode (Vite DEV).
- `__engine.renderer.viewport` to inspect current viewport state from console.
