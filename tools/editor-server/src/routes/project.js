import { getProjectPath } from "../lib/paths.js";
import { fileExists, readJsonFile, writeJsonFile } from "../lib/fs-utils.js";
import { findWorldIdForMap } from "../lib/world-index.js";

const DEFAULT_PROJECT = {
  gameStart: { mapId: "", x: 0, y: 0, worldId: null },
};

function normalizeInt(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : 0;
}

function validateProjectPayload(body) {
  if (!body || typeof body !== "object") return "Payload must be a JSON object";
  if (!body.gameStart || typeof body.gameStart !== "object") return "Missing 'gameStart' object";
  if (typeof body.gameStart.mapId !== "string") return "gameStart.mapId must be a string";
  return null;
}

export async function registerProjectRoutes(fastify) {
  fastify.get("/api/project", async (request) => {
    const projectPath = getProjectPath();

    if (!(await fileExists(projectPath))) {
      return DEFAULT_PROJECT;
    }

    const data = await readJsonFile(projectPath);

    // Derive worldId if missing so the editor always sees it
    const gs = data?.gameStart;
    if (gs && typeof gs.mapId === "string" && gs.mapId && !gs.worldId) {
      try {
        gs.worldId = await findWorldIdForMap(gs.mapId);
      } catch (err) {
        request.log.warn(`Failed to derive worldId on GET: ${err.message}`);
      }
    }

    return data;
  });

  fastify.put("/api/project", async (request, reply) => {
    const body = request.body;
    const validationError = validateProjectPayload(body);

    if (validationError) {
      reply.code(400);
      return { ok: false, error: validationError };
    }

    const mapId = body.gameStart.mapId;
    const x = normalizeInt(body.gameStart.x);
    const y = normalizeInt(body.gameStart.y);

    let worldId = null;
    if (mapId) {
      try {
        worldId = await findWorldIdForMap(mapId);
      } catch (err) {
        request.log.warn(`Failed to derive worldId for "${mapId}": ${err.message}`);
      }
    }

    const normalized = {
      gameStart: { mapId, x, y, worldId },
    };

    await writeJsonFile(getProjectPath(), normalized);

    reply.code(200);
    return { ok: true };
  });
}
