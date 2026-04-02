export const EDITOR_MIN_ZOOM = 1;
export const EDITOR_MAX_ZOOM = 8;
export const EDITOR_ZOOM_WHEEL_THRESHOLD = 100;
export const EDITOR_SERVER_ORIGIN = "http://localhost:3032";

/** Default layer stack for newly created maps. Add layers here to include them in all new maps. */
export const DEFAULT_MAP_LAYERS = [
  "ground",
  "ground_detail",
  "fringe",
  "collision",
  "light_blockers",
  "regions",
];

export const DEFAULT_MAP_WIDTH  = 192;
export const DEFAULT_MAP_HEIGHT = 192;
