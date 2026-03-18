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
- Shared viewport reference: Camera and MapChunkRenderer hold reference to Renderer's ViewportState
- Overscan strategy: viewport uses Math.ceil for tile count (CSS "cover"), clipped by parent overflow:hidden
- Pixel-perfect rounding: Math.floor everywhere in render path (never Math.round)
- Chunk-based map data: MapData holds Map<string, ChunkData>, tiles accessed via worldToChunk()
- See [architecture.md](architecture.md) for detailed subsystem docs

## Key files
- `src/client/ClientApp.js` — orchestrator (was Engine.js), init order matters
- `src/client/main.js` — entry point
- `src/client/game/Player.js` — player movement with WASD/arrows + tile collision
- `src/client/game/PlayerView.js` — AnimatedSprite from spritesheet, floor-snapped positioning
- `src/client/scenes/SceneMap.js` — main game scene, wires everything together
- `src/shared/input/Input.js` — keyboard polling (shared by client + editor)
- `src/client/render/ChunkDebugOverlay.js` — tile grid + chunk boundary debug lines
- `src/client/render/HitboxDebugOverlay.js` — entity hitbox debug rectangles
- `src/client/render/TileLayerDebugOverlay.js` — collision layer debug highlight
- `src/shared/core/Config.js` — viewport constraints, tick rate
- `src/shared/core/GameLoop.js` — fixed timestep loop
- `src/shared/render/Renderer.js` — Pixi setup, owns ViewportState, resize logic
- `src/shared/render/ResolutionManager.js` — pure function: computeViewport()
- `src/shared/render/ViewportState.js` — plain data class (scale, tiles, dimensions, offsets)
- `src/shared/render/Camera.js` — follows player, bounds clamping, debug free mode (IJKL)
- `src/shared/render/MapChunkRenderer.js` — chunk-based tilemap rendering (Sprites from atlas)
- `src/shared/render/ChunkLayerView.js` — single chunk+layer Sprite container
- `src/shared/render/EntityRenderer.js` — entity→sprite sync with interpolation
- `src/shared/render/DebugOverlay.js` — FPS/stats, toggled with Escape
- `src/shared/data/TileCollision.js` — AABB vs tile-layer collision check
- `src/shared/data/models/MapData.js` — chunk-based map data (width, height, chunks)
- `src/shared/data/models/ChunkData.js` — single chunk tile data (layers of Int16Array, filled with -1)
- `src/shared/data/models/GameMap.js` — static loader facade
- `src/shared/data/models/Entity.js` — base entity data (no PixiJS)
- `src/shared/data/models/EntityManager.js` — entity registry
- `src/shared/data/models/EntityData.js` — serializable entity snapshot
- `src/shared/data/models/PlayerAnimations.js` — animation metadata
- `src/shared/data/loaders/MapLoader.js` — fetch map + tileset JSON → MapData with chunks
- `src/shared/data/serializers/MapSerializer.js` — MapData ↔ JSON
- `src/shared/data/validators/MapValidator.js` — validate map integrity
- `src/shared/assets/AssetsManager.js` — PixiJS Assets wrapper
- `src/shared/assets/AssetManifest.js` — bundle definitions
- `src/shared/assets/SpriteSheetSlicer.js` — texture slicing utility
- `src/editor/EditorApp.js` — editor orchestrator (save flow via editor-server)
- `src/editor/EditorShell.js` — HTML layout
- `src/editor/EditorConfig.js` — EDITOR_SERVER_ORIGIN constant
- `src/editor/EditorState.js` — central editor state (includes saveStatus)
- `src/editor/EditorViewport.js` — canvas mouse/keyboard events → ToolManager
- `src/editor/scenes/SceneEditor.js` — main editor scene
- `src/editor/tools/ToolManager.js` — tool registry + temporary tool
- `src/editor/tools/PanTool.js` — camera drag
- `src/editor/tools/PencilTool.js` — paint tiles
- `src/editor/tools/EraseTool.js` — erase tiles (set to -1)
- `src/editor/utils/clampEditorCamera.js` — editor camera clamp (half-viewport margins)
- `tools/editor-server/src/server.js` — Fastify dev server (port 3032)
- `tools/editor-server/src/routes/maps.js` — map list/load/save API
- `tools/editor-server/src/routes/tilesets.js` — tileset API
- `tools/editor-server/src/lib/map-codecs.js` — authored↔runtime conversion
- `tools/editor-server/src/lib/paths.js` — content path resolution
- `tools/editor-server/src/lib/fs-utils.js` — file I/O + backup helpers
- `src/server/ServerApp.js` — headless tick loop (skeleton)

## PixiJS v8 gotchas
- No BaseTexture, no SCALE_MODES enum — use TextureSource + string literals
- Application.init() is async
- roundPixels: true for pixel art
- resolution: 1 (CSS scaling, not devicePixelRatio)
- app.renderer.resize(w, h) for dynamic viewport changes
- Graphics per-tile is expensive — use Sprites with shared textures

## Status
- Modular architecture implemented: client/editor/server/shared
- Core client architecture working: viewport, rendering, entities, input, scenes
- Chunk-based map system: MapData + ChunkData, JSON map loading with tileset metadata
- Multi-layer tilemap: ground, ground_detail, fringe (above entities), collision
- MapChunkRenderer: Sprite-based chunk rendering with lazy texture cache from atlas
- Tile collision: AABB hitbox vs collision layer, per-axis resolve in Player
- Debug overlays: collision (red), hitbox (cyan), tile grid (blue), chunk boundaries (red)
- Player animated sprite from spritesheet (4x31 frames, 16x16)
- Content structure: atlas/, maps/, tilesets/, sprites/, dialogue/, interactions/, items/, npcs/, objects/, skills/
- Editor functional: tools (pan/pencil/eraser), panels, viewport with navigation (Space+drag, middle mouse), camera clamp
- Editor-server: Fastify dev server (port 3032) for save/load, dual-format persistence (authored + runtime), auto-backups
- Empty tile is -1 (EMPTY_TILE), tile IDs are 0-indexed into atlas, Int16Array storage
- Server is stub, not functional
- No networking yet
