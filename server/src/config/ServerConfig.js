import { TICK_RATE, TICK_MS } from "../../../src/shared/core/Config.js";

export function createServerConfig(overrides = {}) {
  return {
    tickRate: TICK_RATE,
    tickMs: TICK_MS,
    serverName: "MINIMMO",
    host: "127.0.0.1",
    port: 3001,
    spawnX: 0,
    spawnY: 0,
    playerSpeed: 120,
    ...overrides,
  };
}
