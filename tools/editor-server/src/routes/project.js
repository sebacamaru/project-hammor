import { getProjectPath } from "../lib/paths.js";
import { fileExists, readJsonFile, writeJsonFile } from "../lib/fs-utils.js";

const DEFAULT_PROJECT = {
  gameStart: { mapId: "", x: 0, y: 0 },
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
  fastify.get("/api/project", async () => {
    const projectPath = getProjectPath();

    if (!(await fileExists(projectPath))) {
      return DEFAULT_PROJECT;
    }

    return readJsonFile(projectPath);
  });

  fastify.put("/api/project", async (request, reply) => {
    const body = request.body;
    const validationError = validateProjectPayload(body);

    if (validationError) {
      reply.code(400);
      return { ok: false, error: validationError };
    }

    const normalized = {
      gameStart: {
        mapId: body.gameStart.mapId,
        x: normalizeInt(body.gameStart.x),
        y: normalizeInt(body.gameStart.y),
      },
    };

    await writeJsonFile(getProjectPath(), normalized);

    reply.code(200);
    return { ok: true };
  });
}
