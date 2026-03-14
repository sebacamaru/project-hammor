# MINIMMO — Project Context

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
├── Input           — client/input/ — polling-based keyboard state
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
- `Player extends Entity` — in `client/game/`, reads input in update().
- `PlayerView` = in `client/game/`, owns AnimatedSprite.
- `PlayerAnimations` = animation metadata in `shared/data/models/`.
- `EntityData` = serializable snapshot in `shared/data/models/`.

### Data model (shared/data/)
- `MapData` = pure map data (width, height, named layers).
- `LayerData` = single tile layer (Uint16Array + get/set).
- `GameMap extends MapData` = adds test data generation.
- `MapLoader` = fetch JSON maps from URLs.
- `MapSerializer` = MapData ↔ JSON conversion.
- `MapValidator` = validate map integrity.

### Tilemap
- `GameMap` = tile data via MapData/LayerData in `shared/data/models/`.
- `TilemapRenderer` = pre-allocated graphics pool in `shared/render/`.

### Viewport system
- `ViewportState` = plain data class (scale, tilesX/Y, widthPx/heightPx, cssWidth/Height, offsetX/Y)
- `ResolutionManager.computeViewport()` = pure function, picks highest integer scale
- `Renderer` owns the ViewportState, recomputes on resize
- `Camera` and `TilemapRenderer` hold a reference to the same ViewportState

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
- **Shared viewport reference**: Camera and TilemapRenderer hold a reference to Renderer's ViewportState.

## File structure
```
src/
├── client/
│   ├── main.js              Entry point
│   ├── ClientApp.js          Orchestrator (was Engine.js)
│   ├── input/Input.js        Keyboard polling
│   ├── game/
│   │   ├── Player.js         Player entity (extends shared Entity)
│   │   └── PlayerView.js     Player sprite (AnimatedSprite)
│   └── scenes/
│       └── SceneMap.js       Main gameplay scene
├── editor/
│   ├── EditorApp.js          Editor shell (Renderer + SceneManager)
│   ├── EditorState.js        Tool/selection state
│   ├── EditorMapService.js   Load/save maps
│   └── tools/
│       ├── BrushTool.js      Paint tiles
│       └── EraserTool.js     Erase tiles
├── server/
│   ├── ServerApp.js          Headless tick loop (no PixiJS)
│   ├── world/WorldMap.js     Server map wrapper
│   └── loaders/ServerMapLoader.js  Load maps from fs
└── shared/
    ├── core/
    │   ├── Config.js         All constants
    │   └── GameLoop.js       Fixed timestep loop
    ├── render/
    │   ├── Renderer.js       PixiJS Application wrapper
    │   ├── Camera.js         Viewport follow/clamp
    │   ├── ViewportState.js  Viewport data
    │   ├── ResolutionManager.js  Viewport computation
    │   ├── TilemapRenderer.js    Tile rendering (Graphics pool)
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
        ├── models/
        │   ├── Entity.js          Base entity data
        │   ├── EntityManager.js   Entity registry
        │   ├── EntityData.js      Serializable snapshot
        │   ├── PlayerAnimations.js  Animation metadata
        │   ├── MapData.js         Pure map data
        │   ├── LayerData.js       Single tile layer
        │   └── GameMap.js         MapData + test generation
        ├── loaders/MapLoader.js        Fetch JSON maps
        ├── serializers/MapSerializer.js  MapData ↔ JSON
        └── validators/MapValidator.js    Map validation

content/
├── maps/       Map JSON files
├── tilesets/    Tileset images
├── sprites/    Character/entity sprites
├── prefabs/    Prefab definitions
└── dialogues/  Dialogue data
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

## Future systems (not yet implemented)
- **Networking**: WebSocket connection, binary protocol. Client-side prediction + server reconciliation.
- **Tileset slicing**: Load tileset PNGs as spritesheets, slice into per-tile textures.
- **Collision**: Tile-based collision layer in MapData.
- **Multiple tile layers**: ground, decoration, fringe (above entities).
- **NPC/Monster entities**: Same entity system, different update logic.
- **Editor UI**: Panels, canvas interaction, mouse input, tool palette.
- **Server networking**: Real WebSocket server with Colyseus or custom.

## Debug
- `Escape` toggles debug overlay (starts hidden). Shows: FPS, camera pos, player pos, entity count, viewport info, canvas size, container size.
- `window.__engine` available in dev mode (Vite DEV).
- `__engine.renderer.viewport` to inspect current viewport state from console.
