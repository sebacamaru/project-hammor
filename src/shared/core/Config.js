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

// Simulation tick rate (ticks per second) — match this to future server tick rate
export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;

export const EMPTY_TILE = -1;

export const PLAYER_SPEED = 48; // pixels per second

// --- Debug feature flags (jitter testing) ---
// Toggle from browser console: __debugFlags.NET_ENABLE_CLIENT_PREDICTION = false
export const DEBUG_FLAGS = {
  NET_ENABLE_CLIENT_PREDICTION: true,
  NET_ENABLE_RECONCILIATION: true,
  NET_ENABLE_REMOTE_INTERPOLATION: true,
};
