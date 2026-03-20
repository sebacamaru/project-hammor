import { readdir, unlink } from "node:fs/promises";
import { getWorldsDir, getWorldPath, validateWorldId } from "../lib/paths.js";
import { fileExists, readJsonFile, writeJsonFile } from "../lib/fs-utils.js";

async function listJsonFileIds(dirPath) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name.replace(/\.json$/i, ""));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

// Reads lightweight metadata from a single world file. Never throws.
async function readWorldMeta(id) {
  const fallback = { id, name: id, version: 1, mapSize: null, cellCount: 0 };
  try {
    const json = await readJsonFile(getWorldPath(id));
    return {
      id,
      name: typeof json.name === "string" ? json.name : id,
      version: typeof json.version === "number" ? json.version : 1,
      mapSize: json.mapSize ?? null,
      cellCount: Object.keys(json.cells ?? {}).length,
    };
  } catch {
    return fallback;
  }
}

function validateWorldPayload(body) {
  if (!body || typeof body !== "object") return "Payload must be a JSON object";
  if (typeof body.id !== "string" || !body.id) return "Missing or invalid 'id'";
  if (!body.mapSize || typeof body.mapSize !== "object") return "Missing 'mapSize'";
  const { width, height } = body.mapSize;
  if (!Number.isInteger(width) || width <= 0) return "mapSize.width must be a positive integer";
  if (!Number.isInteger(height) || height <= 0) return "mapSize.height must be a positive integer";
  if (body.cells !== undefined && (typeof body.cells !== "object" || Array.isArray(body.cells))) {
    return "'cells' must be an object";
  }
  return null;
}

export async function registerWorldRoutes(fastify) {
  fastify.get("/api/worlds", async () => {
    const ids = await listJsonFileIds(getWorldsDir());
    return Promise.all(ids.map((id) => readWorldMeta(id)));
  });

  fastify.get("/api/worlds/:id", async (request, reply) => {
    const worldId = validateWorldId(request.params.id);
    const worldPath = getWorldPath(worldId);

    if (!(await fileExists(worldPath))) {
      reply.code(404);
      return { ok: false, error: `World "${worldId}" was not found` };
    }

    return readJsonFile(worldPath);
  });

  fastify.put("/api/worlds/:id", async (request, reply) => {
    const worldId = validateWorldId(request.params.id);
    const body = request.body;
    const validationError = validateWorldPayload(body);

    if (validationError) {
      reply.code(400);
      return { ok: false, error: validationError };
    }

    if (body.id !== worldId) {
      reply.code(400);
      return { ok: false, error: "URL id does not match payload id" };
    }

    const normalized = {
      id: worldId,
      name: typeof body.name === "string" && body.name ? body.name : worldId,
      version: Number.isInteger(body.version) && body.version > 0 ? body.version : 1,
      mapSize: {
        width: body.mapSize.width,
        height: body.mapSize.height,
      },
      cells: body.cells ?? {},
    };

    await writeJsonFile(getWorldPath(worldId), normalized);

    reply.code(200);
    return { ok: true };
  });

  fastify.delete("/api/worlds/:id", async (request, reply) => {
    const worldId = validateWorldId(request.params.id);
    const worldPath = getWorldPath(worldId);

    if (!(await fileExists(worldPath))) {
      reply.code(404);
      return { ok: false, error: `World "${worldId}" was not found` };
    }

    await unlink(worldPath);

    reply.code(200);
    return { ok: true };
  });
}
