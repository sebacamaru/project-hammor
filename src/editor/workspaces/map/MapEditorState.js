import {
  getMapLightingPreviewPreferences,
  setMapLightingPreviewPreferences,
} from "../../shared/EditorPreferences.js";

/**
 * Holds the current editor state: selected tool, tile, layer, etc.
 */
export class MapEditorState {
  constructor() {
    this._lightingPreviewDefaults = {
      enabled: true,
      ambientColor: "#223344",
      ambientIntensity: 0.6,
    };

    const savedPreview = getMapLightingPreviewPreferences(
      this._lightingPreviewDefaults
    );

    this.state = {
      mode: "terrain",

      activeTool: "pencil",
      lastTerrainTool: "pencil",
      activeLayer: "ground",

      visibleLayers: {
        ground: true,
        ground_detail: true,
        fringe: true,
      },

      selectedTileId: 4,

      selectedBrush: {
        width: 1,
        height: 1,
        tiles: [4],
      },

      hoverTile: null,

      camera: {
        x: 0,
        y: 0,
      },

      editorScale: 1,
      uiVisible: true,
      showGrid: true,

      dirtyChunks: new Set(),

      map: null,
      dirty: false,
      saveStatus: "idle",
      statusMessage: "",

      selectedEntityId: null,
      entityPlaceMode: false,
      selectedLightId: null,
      lightPlaceMode: false,
      copiedLightSettings: null,

      lightingPreview: savedPreview,
    };

    this.listeners = new Set();
  }

  get() {
    return this.state;
  }

  patch(partial) {
    const prev = this.state.lightingPreview;
    Object.assign(this.state, partial);
    const next = this.state.lightingPreview;
    if (
      prev.enabled !== next.enabled ||
      prev.ambientColor !== next.ambientColor ||
      prev.ambientIntensity !== next.ambientIntensity
    ) {
      setMapLightingPreviewPreferences(next, this._lightingPreviewDefaults);
    }
    this.emit();
  }

  update(fn) {
    const before = { ...this.state.lightingPreview };
    fn(this.state);
    const after = this.state.lightingPreview;
    if (
      before.enabled !== after.enabled ||
      before.ambientColor !== after.ambientColor ||
      before.ambientIntensity !== after.ambientIntensity
    ) {
      setMapLightingPreviewPreferences(after, this._lightingPreviewDefaults);
    }
    this.emit();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    const listeners = [...this.listeners];
    for (const listener of listeners) {
      listener(this.state);
    }
  }
}
