/**
 * Holds the current editor state: selected tool, tile, layer, etc.
 */
export class EditorState {
  constructor() {
    this.state = {
      mode: "terrain",

      activeTool: "pencil",
      activeLayer: "ground",

      visibleLayers: {
        ground: true,
        ground_detail: true,
        fringe: true,
      },

      selectedTileId: -1,

      selectedBrush: {
        width: 1,
        height: 1,
        tiles: [-1],
      },

      hoverTile: null,

      camera: {
        x: 0,
        y: 0,
        zoom: 1,
      },

      uiVisible: true,

      map: null,
      dirty: false,
    };

    this.listeners = new Set();
  }

  get() {
    return this.state;
  }

  patch(partial) {
    Object.assign(this.state, partial);
    this.emit();
  }

  update(fn) {
    fn(this.state);
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
