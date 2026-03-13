# MINIMMO — Project Context

## What is this
2D MMORPG client called **MINIMMO** (codename: project-hammor). Written in vanilla JavaScript with PixiJS v8 and Vite.

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

### Core loop
- **Fixed timestep** simulation at 20 ticks/sec (`TICK_RATE` in Config.js)
- Variable render rate (requestAnimationFrame)
- `Engine.update(dt)` → simulation logic
- `Engine.render(alpha)` → interpolated rendering
- Alpha = fractional tick progress for smooth visuals between sim ticks

### Subsystem ownership
```
Engine (orchestrator)
├── Renderer        — PixiJS Application, dynamic viewport, canvas scaling
│   ├── ViewportState   — plain data: scale, tiles, dimensions, offsets
│   └── ResolutionManager — pure function to compute viewport from screen size
├── Input           — polling-based keyboard state
├── SceneManager    — scene stack (goto/push/pop)
├── GameLoop        — fixed timestep + RAF
└── DebugOverlay    — FPS/stats (Escape to toggle, starts hidden)
```

### Scene lifecycle
Scenes implement: `enter(engine)` → `update(dt)` → `render(alpha)` → `exit()` → `destroy()`

### Entity system
- `Entity` = pure data (id, x, y, prevX, prevY, direction, speed). NO Pixi imports.
- `EntityManager` = collection with add/remove/get by ID.
- `EntityRenderer` = syncs entity data → Pixi sprites with interpolation.
- `Player extends Entity` — reads input in update(), no Pixi dependency.
- `PlayerView` = owns AnimatedSprite, reads Player state, updates sprite position with `Math.floor`.

### Tilemap
- `GameMap` = tile data in typed arrays (`Uint16Array`), supports named layers.
- `TilemapRenderer` = pre-allocated graphics pool (MAX_TILES + 2 margin), viewport culling per frame. Receives viewport reference.

### Viewport system
- `ViewportState` = plain data class (scale, tilesX/Y, widthPx/heightPx, cssWidth/Height, offsetX/Y)
- `ResolutionManager.computeViewport()` = pure function, picks highest integer scale, ceil-based tile count (overscan), clamps to allowed ranges
- `Renderer` owns the ViewportState, recomputes on resize, exposes `renderer.viewport`
- `Camera` and `TilemapRenderer` hold a reference to the same ViewportState — no events needed
- Config.js defines: `TILE_SIZE`, `BASE_TILES_X/Y`, `MIN/MAX_SCALE`, `MIN/MAX_TILES_X/Y`

### Pixel-perfect rendering pipeline
- Game logic uses float positions (Entity.x/y)
- Rendering converts to integers: `Math.floor` for sprite positions and camera
- Camera and sprites use the **same** rounding function (`Math.floor`) to avoid 1px oscillation
- `roundPixels: true` in PixiJS provides GPU-level safety net

### Key patterns
- **Service locator**: Engine passes `this` to subsystems. No DI framework.
- **Data/visual separation**: Entity logic has zero Pixi imports. EntityRenderer handles all visuals.
- **Polling input**: Input state is read synchronously during update(), not via event callbacks.
- **Interpolation**: Entities store `prevX/prevY`. Render uses `prev + (curr - prev) * alpha`.
- **Shared viewport reference**: Camera and TilemapRenderer hold a reference to Renderer's ViewportState. Values update in-place on resize.

## File structure
```
src/
├── core/        Engine.js, GameLoop.js, Config.js
├── render/      Renderer.js, Camera.js, ResolutionManager.js, ViewportState.js
├── scene/       SceneManager.js, Scene.js, SceneMap.js
├── world/       GameMap.js, TilemapRenderer.js
├── entity/      Entity.js, Player.js, PlayerView.js, PlayerAnimations.js, EntityManager.js, EntityRenderer.js
├── input/       Input.js
├── assets/      AssetsManager.js, AssetManifest.js
├── utils/       SpriteSheetSlicer.js
├── debug/       DebugOverlay.js
└── main.js
```

## Conventions
- Keep entities engine-agnostic (no pixi imports in entity/).
- Keep world/ for data structures only, rendering goes in render/ or paired Renderer classes.
- Scene classes should clean up all Pixi objects in destroy().
- Config.js holds all magic numbers as named exports.
- Spanish comments are OK (original dev language).
- Asset bundles are organized by scene/area, not by type.
- Use `Math.floor` for all render-time position rounding (sprites AND camera). Never `Math.round`.

## Important PixiJS v8 notes
- `Application.init()` is async — must await before using stage/canvas.
- Use `TextureSource.defaultOptions.scaleMode = 'nearest'` (not BaseTexture).
- `roundPixels: true` in app init prevents pixel art shimmering.
- `resolution: 1` because we CSS-scale — don't use devicePixelRatio.
- Graphics objects are expensive (each = draw call). Prefer Sprites with shared textures.
- `app.renderer.resize(w, h)` to change internal resolution dynamically.

## Future systems (not yet implemented)
- **Networking**: `net/Connection.js` (WebSocket), `net/Protocol.js` (binary messages). Client-side prediction + server reconciliation.
- **MapLoader**: Load JSON maps from `/data/maps/`.
- **Tileset slicing**: Load tileset PNGs as spritesheets, slice into per-tile textures.
- **Collision**: Tile-based collision layer in GameMap.
- **Multiple tile layers**: ground, decoration, fringe (above entities).
- **NPC/Monster entities**: Same entity system, different update logic.

## Debug
- `Escape` toggles debug overlay (starts hidden). Shows: FPS, camera pos, player pos, entity count, viewport info, canvas size, container size.
- `window.__engine` available in dev mode (Vite DEV).
- `__engine.renderer.viewport` to inspect current viewport state from console.

## Documentation
- `docs/memory.md` — project summary, key decisions, status, PixiJS gotchas.
- `docs/architecture.md` — init sequence, data flow per frame, entity/scene/tilemap design, networking plan.
