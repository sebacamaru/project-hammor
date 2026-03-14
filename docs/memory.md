# MINIMMO (project-hammor) — Memory

## Project
- 2D MMORPG, codename "project-hammor"
- PixiJS v8 + vanilla JS + Vite 8
- Modular architecture: client / editor / server / shared
- Dynamic viewport: ~40x22 tiles, integer scale 2x–6x, adapts to screen size
- Fixed timestep at 20Hz, variable render with interpolation

## Architecture decisions
- **Modular separation**: shared/ (reusable), client/ (game), editor/ (tools), server/ (headless)
- **Dependency rules**: server never imports from shared/render/ or shared/assets/
- Entity/visual separation: Entity.js is pure data in shared/, renderers in shared/render/
- Client-specific gameplay (Player, PlayerView, Input) lives in client/
- Service locator pattern: ClientApp passes `this` to subsystems
- Polling input (not event-driven)
- Scene stack with full lifecycle (enter/exit/update/render/destroy)
- Shared viewport reference: Camera and TilemapRenderer hold reference to Renderer's ViewportState
- Overscan strategy: viewport uses Math.ceil for tile count (CSS "cover"), clipped by parent overflow:hidden
- Pixel-perfect rounding: Math.floor everywhere in render path (never Math.round)
- Data model: MapData/LayerData (pure data) → GameMap extends MapData for convenience
- See [architecture.md](architecture.md) for detailed subsystem docs

## Key files
- `src/client/ClientApp.js` — orchestrator (was Engine.js), init order matters
- `src/client/main.js` — entry point
- `src/client/game/Player.js` — player movement with WASD/arrows
- `src/client/game/PlayerView.js` — AnimatedSprite from spritesheet, floor-snapped positioning
- `src/client/scenes/SceneMap.js` — main game scene, wires everything together
- `src/client/input/Input.js` — keyboard polling
- `src/shared/core/Config.js` — viewport constraints, tick rate
- `src/shared/core/GameLoop.js` — fixed timestep loop
- `src/shared/render/Renderer.js` — Pixi setup, owns ViewportState, resize logic
- `src/shared/render/ResolutionManager.js` — pure function: computeViewport()
- `src/shared/render/ViewportState.js` — plain data class (scale, tiles, dimensions, offsets)
- `src/shared/render/Camera.js` — follows player, bounds clamping, uses viewport reference
- `src/shared/render/TilemapRenderer.js` — pre-allocated pool for max viewport, culls per frame
- `src/shared/render/EntityRenderer.js` — entity→sprite sync with interpolation
- `src/shared/render/DebugOverlay.js` — FPS/stats, toggled with Escape
- `src/shared/data/models/MapData.js` — pure map data (width, height, layers)
- `src/shared/data/models/LayerData.js` — single tile layer (Uint16Array + get/set)
- `src/shared/data/models/GameMap.js` — extends MapData, adds generateTest()
- `src/shared/data/models/Entity.js` — base entity data (no PixiJS)
- `src/shared/data/models/EntityManager.js` — entity registry
- `src/shared/data/models/EntityData.js` — serializable entity snapshot
- `src/shared/data/models/PlayerAnimations.js` — animation metadata
- `src/shared/data/loaders/MapLoader.js` — fetch JSON → MapData
- `src/shared/data/serializers/MapSerializer.js` — MapData ↔ JSON
- `src/shared/data/validators/MapValidator.js` — validate map integrity
- `src/shared/assets/AssetsManager.js` — PixiJS Assets wrapper
- `src/shared/assets/AssetManifest.js` — bundle definitions
- `src/shared/assets/SpriteSheetSlicer.js` — texture slicing utility
- `src/editor/EditorApp.js` — editor shell (skeleton)
- `src/server/ServerApp.js` — headless tick loop (skeleton)

## PixiJS v8 gotchas
- No BaseTexture, no SCALE_MODES enum — use TextureSource + string literals
- Application.init() is async
- roundPixels: true for pixel art
- resolution: 1 (CSS scaling, not devicePixelRatio)
- app.renderer.resize(w, h) for dynamic viewport changes
- Graphics per-tile is expensive — migrate to Sprites when tilesets are ready

## Status
- Modular architecture implemented: client/editor/server/shared
- Core client architecture working: viewport, rendering, entities, input, scenes
- Data model layer: MapData, LayerData, EntityData, MapSerializer, MapValidator, MapLoader
- Editor skeleton: EditorApp, EditorState, BrushTool, EraserTool, EditorMapService
- Server skeleton: ServerApp, WorldMap, ServerMapLoader
- Player animated sprite from spritesheet (4x31 frames, 16x16)
- Debug overlay: Escape to toggle, shows FPS/cam/player/viewport/canvas/container
- Using placeholder Graphics for tiles (no real tileset art yet)
- No networking, no collision, no real map loading from JSON yet
- Editor and server are stubs, not functional
