# Architecture Details

## Module structure
```
src/
├── shared/    Reusable core: render pipeline, scene system, data models, assets
├── client/    Game runtime: ClientApp, Input, Player, gameplay scenes
├── editor/    Map editor: EditorApp, tools, state (skeleton)
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
│   │       ├── Player.update(dt, input) — movement
│   │       ├── EntityManager.updateAll(dt, input)
│   │       └── Camera debug mode check
│   └── accumulator -= TICK_MS
├── alpha = accumulator / TICK_MS
└── ClientApp.render(alpha)
    ├── SceneManager.render(alpha)
    │   └── SceneMap.render(alpha)
    │       ├── Camera.renderUpdate(player, alpha) — interpolate + recalc bounds
    │       ├── root.x/y = -camera (already floor-snapped)
    │       ├── TilemapRenderer.render(camera) — viewport culling
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
  TilemapRenderer reads viewport.tilesX/tilesY (same reference)
```

### Config constants (shared/core/Config.js)
- TILE_SIZE = 16
- BASE_TILES_X = 40, BASE_TILES_Y = 22
- MIN_SCALE = 2, MAX_SCALE = 6
- MIN_TILES_X = 38, MAX_TILES_X = 46
- MIN_TILES_Y = 20, MAX_TILES_Y = 26
- TICK_RATE = 20, TICK_MS = 50

## Scene lifecycle
- enter(engine) — create containers, load map, setup entities, pass viewport to Camera/TilemapRenderer, add to stage
- update(dt) — game logic, entity updates, camera debug mode
- render(alpha) — camera interpolation, visual sync, tilemap render, entity interpolation
- exit() — remove containers from stage
- destroy() — destroy all Pixi objects, clear references

## Entity system design

### Data layer (shared/data/models/)
- **Entity**: pure data object (id, x, y, prevX, prevY, direction, speed, type). Auto-increment ID.
- **EntityManager**: Map<id, Entity>, add/remove/get/getAll/updateAll
- **EntityData**: serializable snapshot for network/persistence, with fromEntity()/toPlain()/fromPlain()
- **PlayerAnimations**: animation name → { row, speed } mapping + DIRECTION_NAMES array

### Client gameplay (client/game/)
- **Player extends Entity**: adds input-driven movement in update(dt, input), normalized diagonal
- **PlayerView**: owns AnimatedSprite, animation map from spritesheet, updates from Player state

### Render layer (shared/render/)
- **EntityRenderer**: Map<id, Sprite>, creates sprites on first sync, interpolates with Math.floor
- **TilemapRenderer**: pre-allocated Graphics pool, viewport culling per frame

## Data model (shared/data/)

### Map data
- **MapData**: pure data — width, height, Map<string, LayerData>. getTile/setTile/addLayer/getLayer.
- **LayerData**: single layer — name, width, height, Uint16Array data. get(x,y)/set(x,y,val)/fill(val).
- **GameMap extends MapData**: convenience subclass that auto-creates "ground" layer and generateTest().

### Serialization pipeline
- **MapSerializer**: serialize(mapData) → JSON object, deserialize(json) → MapData
- **MapLoader**: fetch(url) → MapSerializer.deserialize() → MapData (browser context)
- **MapValidator**: validate(mapData) → { valid, errors[] }

## Pixel-perfect rendering rules
- All render-time positions use `Math.floor` (sprites AND camera)
- Camera and sprites must use the SAME rounding function to avoid 1px oscillation
- Game logic keeps float coordinates — rounding is render-only
- `roundPixels: true` in PixiJS as GPU-level safety net

## Tilemap rendering
- Pool of (MAX_TILES_X+2) * (MAX_TILES_Y+2) Graphics objects (pre-allocated for max viewport)
- Each frame: calculate visible tile range from camera, reassign tiles using viewport.tilesX/Y
- Out-of-bounds tiles get visible=false, excess pool entries hidden
- Currently uses Graphics.rect + fill (placeholder)
- TODO: migrate to Sprites with tileset textures for batching

## Editor architecture (skeleton)
- **EditorApp**: composes shared Renderer + SceneManager + GameLoop. No Input (will use mouse).
- **EditorState**: currentTool, selectedTileId, brushSize, activeLayer
- **BrushTool/EraserTool**: pure logic, apply(mapData, x, y, ...) → modify tiles
- **EditorMapService**: uses shared MapLoader + MapSerializer for load/save

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
