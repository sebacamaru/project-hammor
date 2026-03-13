# MINIMMO (project-hammor) — Memory

## Project
- 2D MMORPG client, codename "project-hammor"
- PixiJS v8 + vanilla JS + Vite 8
- Dynamic viewport: ~40x22 tiles, integer scale 2x–6x, adapts to screen size
- Fixed timestep at 20Hz, variable render with interpolation

## Architecture decisions
- Entity/visual separation: Entity.js is pure data, EntityRenderer.js handles Pixi sprites
- Service locator pattern: Engine passes `this` to subsystems
- Polling input (not event-driven)
- Scene stack with full lifecycle (enter/exit/update/render/destroy)
- Shared viewport reference: Camera and TilemapRenderer hold reference to Renderer's ViewportState
- Overscan strategy: viewport uses Math.ceil for tile count (CSS "cover"), clipped by parent overflow:hidden
- Pixel-perfect rounding: Math.floor everywhere in render path (never Math.round)
- See [architecture.md](architecture.md) for detailed subsystem docs

## Key files
- `src/core/Engine.js` — orchestrator, init order matters
- `src/core/GameLoop.js` — fixed timestep loop
- `src/core/Config.js` — viewport constraints (TILE_SIZE, BASE_TILES, MIN/MAX_SCALE, MIN/MAX_TILES), tick rate
- `src/render/Renderer.js` — Pixi setup, owns ViewportState, resize logic
- `src/render/ResolutionManager.js` — pure function: computeViewport()
- `src/render/ViewportState.js` — plain data class (scale, tiles, dimensions, offsets)
- `src/render/Camera.js` — follows player, bounds clamping, uses viewport reference
- `src/scene/SceneMap.js` — main game scene, wires viewport to Camera/TilemapRenderer
- `src/entity/Player.js` — player movement with WASD/arrows
- `src/entity/PlayerView.js` — AnimatedSprite from spritesheet, floor-snapped positioning
- `src/world/TilemapRenderer.js` — pre-allocated pool for max viewport, culls per frame

## PixiJS v8 gotchas
- No BaseTexture, no SCALE_MODES enum — use TextureSource + string literals
- Application.init() is async
- roundPixels: true for pixel art
- resolution: 1 (CSS scaling, not devicePixelRatio)
- app.renderer.resize(w, h) for dynamic viewport changes
- Graphics per-tile is expensive — migrate to Sprites when tilesets are ready

## Status
- Core architecture implemented and building clean
- Dynamic viewport system with overscan working
- Pixel-perfect rendering pipeline (Math.floor everywhere, no jitter)
- Player animated sprite from spritesheet (4x31 frames, 16x16)
- Debug overlay: Escape to toggle, shows FPS/cam/player/viewport/canvas/container
- Using placeholder Graphics for tiles (no real tileset art yet)
- No networking, no collision, no map loading from JSON yet
