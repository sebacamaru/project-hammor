import { SERVER_TICK_RATE, SERVER_TICK_MS, SNAPSHOT_INTERVAL_TICKS, PLAYER_SPEED } from "../../../src/shared/core/Config.js";

/**
 * Creates the server configuration object.
 * Imports tick constants from shared Config (single source of truth).
 * @param {object} [overrides] - Optional overrides for any config field.
 * @returns {object} Server configuration.
 */
export function createServerConfig(overrides = {}) {
  return {
    tickRate: SERVER_TICK_RATE,
    tickMs: SERVER_TICK_MS,
    serverName: "MINIMMO",
    host: "127.0.0.1",
    port: 3001,
    startMapId: "test_map",
    spawnX: 8, // center of tile 0,0
    spawnY: 16, // center of tile 0,0
    playerSpeed: PLAYER_SPEED,
    snapshotInterval: SNAPSHOT_INTERVAL_TICKS,
    ...overrides,
  };
}
