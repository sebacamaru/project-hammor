# Plan: Editor Shell + Workspaces Refactor

## Context

The editor currently centers around `EditorApp.js` which is both the orchestrator and the map editor. We need to introduce a **shell** layer that manages workspace tabs (Map / World / Database), where the current map editor becomes one workspace. The map editor must continue working exactly as before.

## Strategy

Conservative, incremental refactor:
1. Create new shell infrastructure alongside existing code
2. Move map editor files into `workspaces/map/` with renames
3. Fix all imports
4. Add minimal mount/unmount lifecycle to MapEditorApp
5. Wire main.js to the new shell
6. Split CSS

## File Operations

### New files to create

| File | Purpose |
|------|---------|
| `src/editor/shell/EditorShell.js` | Top-level shell: tab bar + workspace host + Ctrl+S delegation |
| `src/editor/shell/ShellState.js` | Minimal reactive state (activeWorkspaceId) |
| `src/editor/shell/WorkspaceRegistry.js` | Simple factory map (id → create function) |
| `src/editor/shared/styles/global.css` | Global resets (from editor.css lines 1-32) |
| `src/editor/shell/styles/shell.css` | Shell tab bar styles |
| `src/editor/workspaces/world/WorldEditorApp.js` | Placeholder workspace |
| `src/editor/workspaces/database/DatabaseEditorApp.js` | Placeholder workspace |

### Files to move and rename

| From | To |
|------|-----|
| `EditorApp.js` | `workspaces/map/MapEditorApp.js` |
| `EditorState.js` | `workspaces/map/MapEditorState.js` |
| `EditorViewport.js` | `workspaces/map/MapEditorViewport.js` |
| `EditorConfig.js` | `workspaces/map/MapEditorConfig.js` |
| `EditorShell.js` | `workspaces/map/MapEditorLayout.js` |
| `document/` | `workspaces/map/document/` |
| `history/` | `workspaces/map/history/` |
| `runtime/` | `workspaces/map/runtime/` |
| `scenes/` | `workspaces/map/scenes/` |
| `tools/` | `workspaces/map/tools/` |
| `panels/` | `workspaces/map/panels/` |
| `utils/clampEditorCamera.js` | `workspaces/map/utils/clampEditorCamera.js` |
| `utils/waitFrames.js` | `workspaces/map/utils/waitFrames.js` |
| `styles/editor.css` | `workspaces/map/styles/map-editor.css` (minus global resets) |

### Class renames

| Old | New | File |
|-----|-----|------|
| `EditorApp` | `MapEditorApp` | `MapEditorApp.js` |
| `EditorState` | `MapEditorState` | `MapEditorState.js` |
| `EditorViewport` | `MapEditorViewport` | `MapEditorViewport.js` |
| `EditorShell` | `MapEditorLayout` | `MapEditorLayout.js` |

### File to rewrite

| File | Change |
|------|--------|
| `main.js` | Mount EditorShell, register 3 workspaces, switchTo("map") |

## Import Path Updates

Files in `workspaces/map/` are 2 levels deeper than before. Imports to `shared/` go from `../../shared/` → `../../../../shared/`. Same for `client/`.

### MapEditorApp.js (6 shared imports change)
- `../shared/X` → `../../../shared/X` (for Renderer, SceneManager, GameLoop, DebugOverlay, AssetManager, Input, TilesetRegistry)
- `./EditorShell.js` → `./MapEditorLayout.js` (class: `MapEditorLayout`)
- `./EditorState.js` → `./MapEditorState.js` (class: `MapEditorState`)
- `./EditorViewport.js` → `./MapEditorViewport.js` (class: `MapEditorViewport`)
- `./EditorConfig.js` → `./MapEditorConfig.js`
- Internal `./tools/`, `./panels/`, etc. stay unchanged (moved together)

### MapEditorViewport.js (1 import changes)
- `./EditorConfig.js` → `./MapEditorConfig.js`
- `./utils/waitFrames.js` → unchanged

### SceneEditor.js (6 imports change)
- `../../shared/scene/Scene.js` → `../../../../shared/scene/Scene.js`
- `../../shared/render/Camera.js` → `../../../../shared/render/Camera.js`
- `../../shared/data/models/GameMap.js` → `../../../../shared/data/models/GameMap.js`
- `../../shared/render/MapChunkRenderer.js` → `../../../../shared/render/MapChunkRenderer.js`
- `../../client/render/TileLayerDebugOverlay.js` → `../../../../client/render/TileLayerDebugOverlay.js`
- `../../client/render/ChunkDebugOverlay.js` → `../../../../client/render/ChunkDebugOverlay.js`
- `../utils/clampEditorCamera.js` → unchanged

### RuntimeMapBridge.js (1 import changes)
- `../../shared/data/models/MapData.js` → `../../../../shared/data/models/MapData.js`
- `../document/MapDocument.js` → unchanged

### clampEditorCamera.js
- Only a JSDoc `@import` comment references `../../shared/render/ViewportState.js` → update to `../../../../shared/render/ViewportState.js`

### All other files (tools/, panels/, document/, history/)
- No shared/ imports — no changes needed

## Lifecycle Changes to MapEditorApp

### Change constructor: no args
```js
// BEFORE: constructor(root) { this.root = root; ... }
// AFTER:
constructor() {
  this.host = null;
  this.currentMapId = "test_map";
  this.document = null;
  this.runtimeMap = null;
  this.history = new History();
  this._runtimeReloadVersion = 0;
  this._statusResetTimeoutId = null;
  this._statusToken = 0;
  this.onKeyDown = this.onKeyDown.bind(this);
}
```

### Rename `start()` → `async mount(host)`
- Receives `host` element as parameter
- Stores `this.host = host`
- All existing `start()` logic stays the same, just uses `this.host` instead of `this.root`

### Add `unmount()` method (replaces destroy)
```js
unmount() {
  this.loop?.stop();
  window.removeEventListener('keydown', this.onKeyDown);
  this.viewport?.destroy();
  this.scenes?.current?.destroy();
  this.documentUnsubscribe?.();
  this.clearStatusResetTimeout();
  this.input?.destroy();
  this.renderer?.destroy();
  if (this.host) {
    this.host.innerHTML = '';
    this.host = null;
  }
}
```

### Add workspace contract methods
```js
async save() { return this.saveMap(); }
canSave() { return !!this.document; }
getTitle() { return "Map Editor"; }
resize(width, height) { /* no-op for now, renderer handles resize internally */ }
update(dt) { /* already exists */ }
```

### Remove Ctrl+S from MapEditorApp.onKeyDown
Ctrl+S lives ONLY in EditorShell. Remove the `e.code === "KeyS"` block from `MapEditorApp.onKeyDown`.

## New Shell Design

### EditorShell.js
```
constructor(root):
  - Creates HTML: .shell-topbar > .shell-tabs + .shell-workspace-host
  - Creates ShellState
  - Creates WorkspaceRegistry
  - Binds window keydown for Ctrl+S

registerWorkspace(id, label, factory):
  - Registers in WorkspaceRegistry
  - Adds tab button to .shell-tabs

async switchTo(id):
  - If same workspace, no-op
  - Call activeWorkspace.unmount()
  - Create new workspace via registry (constructor with no args)
  - await workspace.mount(this.workspaceHost)
  - Update ShellState.activeWorkspaceId
  - Update active tab class

onKeyDown(e):
  - Only Ctrl+S: e.preventDefault(), call activeWorkspace.save?.()
```

### HTML structure
```html
<div class="shell-topbar">
  <div class="shell-tabs">
    <button class="shell-tab is-active">Map</button>
    <button class="shell-tab">World</button>
    <button class="shell-tab">Database</button>
  </div>
</div>
<div class="shell-workspace-host"></div>
```

### Workspace contract (informal, no base class)
```
constructor()          - no args, lightweight init
mount(host)            - init and mount DOM into host element
unmount()              - teardown, clear DOM, can be re-mounted later
resize(width, height)  - handle resize
update(dt)             - per-frame update
save()                 - save if applicable
canSave()              - returns boolean
getTitle()             - returns display name string
```

## CSS Split

### shared/styles/global.css (global resets)
- `@font-face`, `*`, `html, body`, `#editor`, `canvas` rules (lines 1-32 of current editor.css)

### shell/styles/shell.css (shell-specific)
- New `.shell-topbar`, `.shell-tabs`, `.shell-tab`, `.shell-workspace-host` styles
- `.shell-topbar`: height ~36px, dark bg, flex, z-index above workspace
- `.shell-workspace-host`: fills remaining height, `position: relative`, `overflow: hidden`

### map-editor.css (everything else from editor.css)
- `.editor-viewport` through end of file (lines 34-252)
- No class name changes needed — these are scoped to the map workspace's DOM
- The `.editor-viewport` and `.editor-shell` with `inset: 0` will fill the workspace host
- Verify position absolute rules work correctly inside `.shell-workspace-host` (which has `position: relative`)

## Execution Order

1. Create directory structure
2. Create shell files: `ShellState.js`, `WorkspaceRegistry.js`, `EditorShell.js`, `shell.css`
3. Create `shared/styles/global.css`
4. Create placeholder workspaces: `WorldEditorApp.js`, `DatabaseEditorApp.js`
5. Move all map editor files with `git mv`
6. Rename classes in moved files
7. Update all imports in moved files
8. Adapt MapEditorApp lifecycle: constructor() no args, mount(host), unmount(), remove Ctrl+S
9. Split CSS (extract global rules to shared/styles/global.css, keep rest as map-editor.css)
10. Rewrite `main.js`
11. Test: `npx vite` → verify map editor works, tabs appear, placeholders show

## Verification

1. Run `npx vite` and open the editor
2. Map tab should be active, map editor should work identically (tools, panels, zoom, pan, save, undo/redo)
3. Click World tab → placeholder appears
4. Click Database tab → placeholder appears
5. Click Map tab → map editor re-mounts and works
6. Ctrl+S works from map workspace (delegated by shell)
7. Ctrl+S does NOT fire from MapEditorApp directly
8. `npx vite build` succeeds
