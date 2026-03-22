export const TILE_SIZE = 16;

// --- Dynamic viewport constraints ---
export const BASE_TILES_X = 40;
export const BASE_TILES_Y = 22;

export const MIN_SCALE = 2;
export const MAX_SCALE = 6;

export const MIN_TILES_X = 38;
export const MAX_TILES_X = 46;
export const MIN_TILES_Y = 20;
export const MAX_TILES_Y = 26;

export const TARGET_FPS = 60;

// --- Tick rates ---
export const SERVER_TICK_RATE = 20;
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE;

export const CLIENT_SIM_TICK_RATE = 60;
export const CLIENT_SIM_TICK_MS = 1000 / CLIENT_SIM_TICK_RATE;

export const SNAPSHOT_RATE = 20;
export const SNAPSHOT_INTERVAL_TICKS = Math.max(
  1,
  Math.floor(SERVER_TICK_RATE / SNAPSHOT_RATE),
);

export const EMPTY_TILE = -1;

export const PLAYER_SPEED = 48; // pixels per second

// --- Remote player interpolation ---
export const REMOTE_INTERPOLATION_DELAY_MS = 100;
export const MAX_REMOTE_SNAPSHOTS = 20;

// --- Debug feature flags (jitter testing) ---
// Toggle from browser console: __debugFlags.NET_ENABLE_CLIENT_PREDICTION = false
export const DEBUG_FLAGS = {
  NET_ENABLE_CLIENT_PREDICTION: true,
  NET_ENABLE_RECONCILIATION: true,
  NET_ENABLE_REMOTE_INTERPOLATION: true,
};
