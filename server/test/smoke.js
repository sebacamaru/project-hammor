import { createServerConfig } from "../src/config/ServerConfig.js";
import { GameServer } from "../src/game/GameServer.js";

async function run() {
  console.log("[SmokeTest] Starting...");

  const config = createServerConfig();
  const server = new GameServer(config);

  const startTime = Date.now();

  server.start();

  // Esperamos 500 ms (deberían ocurrir ~10 ticks si TPS=20)
  await new Promise((resolve) => setTimeout(resolve, 500));

  await server.stop();

  const duration = Date.now() - startTime;

  console.log(`[SmokeTest] Ran for ${duration} ms`);
  console.log(`[SmokeTest] Tick count: ${server.tickCount}`);

  // Validaciones mínimas
  if (server.tickCount <= 0) {
    throw new Error("[SmokeTest] ❌ Server did not tick");
  }

  // Validación opcional (aproximada)
  const expectedTicks = (duration / 1000) * config.tickRate;
  const minExpected = expectedTicks * 0.5; // margen amplio
  const maxExpected = expectedTicks * 1.5;

  if (server.tickCount < minExpected || server.tickCount > maxExpected) {
    console.warn(
      `[SmokeTest] ⚠️ Tick count out of expected range (${minExpected.toFixed(
        1,
      )} - ${maxExpected.toFixed(1)})`,
    );
  }

  console.log("[SmokeTest] ✅ Passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
