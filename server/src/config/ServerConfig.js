import { TICK_RATE, TICK_MS, PLAYER_SPEED } from "../../../src/shared/core/Config.js";

/**
 * Creates the server configuration object.
 * Imports tickRate/tickMs from shared Config (single source of truth).
 * @param {object} [overrides] - Optional overrides for any config field.
 * @returns {object} Server configuration.
 */
export function createServerConfig(overrides = {}) {
  return {
    tickRate: TICK_RATE,
    tickMs: TICK_MS,
    serverName: "MINIMMO",
    host: "127.0.0.1",
    port: 3001,
    startMapId: "test_map",
    spawnX: 8, // center of tile 0,0
    spawnY: 16, // center of tile 0,0
    playerSpeed: PLAYER_SPEED,
    snapshotInterval: 3, // ticks between snapshots (~150ms at 20 TPS)
    ...overrides,
  };
}
