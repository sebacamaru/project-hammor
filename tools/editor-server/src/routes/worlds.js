import { readdir, unlink } from "node:fs/promises";
import {
  getAuthoredWorldPath,
  getAuthoredWorldsDir,
  getWorldBackupDir,
  getWorldPath,
  getWorldsDir,
  validateWorldId,
} from "../lib/paths.js";
import {
  backupFileIfExists,
  createTimestamp,
  ensureDir,
  fileExists,
  readJsonFile,
  writeJsonFile,
} from "../lib/fs-utils.js";
import {
  authoredToRuntimeJson,
  normalizeAuthoredWorldPayload,
  runtimeToAuthoredJson,
  validateAuthoredWorldPayload,
} from "../lib/world-codecs.js";
import { invalidateWorldIndex } from "../lib/world-index.js";

// Returns json file ids from a directory, ignoring hidden dirs and .runtime. files.
async function listJsonFileIds(dirPath) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(".json") &&
          !entry.name.startsWith(".") &&
          !entry.name.includes(".runtime."),
      )
      .map((entry) => entry.name.replace(/\.json$/i, ""));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function looksLikeRuntimeWorld(data) {
  return (
    data &&
    typeof data === "object" &&
    Number.isInteger(data.regionWidth) &&
    Number.isInteger(data.regionHeight) &&
    Array.isArray(data.maps)
  );
}

function looksLikeAuthoredWorld(data) {
  return data && typeof data === "object" && data.mapSize && data.cells;
}

// Reads lightweight metadata from a single world, preferring authored format.
async function readWorldMeta(id) {
  const fallback = { id, name: id, version: 1, mapSize: null, cellCount: 0, mapIds: [] };
  try {
    const authoredPath = getAuthoredWorldPath(id);
    const runtimePath = getWorldPath(id);

    let json = null;
    if (await fileExists(authoredPath)) {
      json = await readJsonFile(authoredPath);
    } else if (await fileExists(runtimePath)) {
      const raw = await readJsonFile(runtimePath);
      json = looksLikeRuntimeWorld(raw) ? runtimeToAuthoredJson(raw) : raw;
    }

    if (!json) return fallback;

    const cells = json.cells ?? {};
    const mapIds = [...new Set(
      Object.values(cells)
        .map((c) => c?.mapId)
        .filter((m) => typeof m === "string" && m),
    )];

    return {
      id,
      name: typeof json.name === "string" ? json.name : id,
      version: typeof json.version === "number" ? json.version : 1,
      mapSize: json.mapSize ?? null,
      cellCount: Object.keys(cells).length,
      mapIds,
    };
  } catch {
    return fallback;
  }
}

export async function registerWorldRoutes(fastify) {
  fastify.get("/api/worlds", async () => {
    const [authoredIds, runtimeIds] = await Promise.all([
      listJsonFileIds(getAuthoredWorldsDir()),
      listJsonFileIds(getWorldsDir()),
    ]);
    const ids = [...new Set([...authoredIds, ...runtimeIds])].sort();

    return Promise.all(ids.map((id) => readWorldMeta(id)));
  });

  fastify.get("/api/worlds/:id", async (request, reply) => {
    const worldId = validateWorldId(request.params.id);
    const authoredPath = getAuthoredWorldPath(worldId);
    const runtimePath = getWorldPath(worldId);

    if (await fileExists(authoredPath)) {
      return readJsonFile(authoredPath);
    }

    if (await fileExists(runtimePath)) {
      const raw = await readJsonFile(runtimePath);
      if (looksLikeRuntimeWorld(raw)) {
        return runtimeToAuthoredJson(raw);
      }
      if (looksLikeAuthoredWorld(raw)) {
        return raw;
      }
    }

    reply.code(404);
    return { ok: false, error: `World "${worldId}" was not found` };
  });

  fastify.put("/api/worlds/:id", async (request, reply) => {
    const worldId = validateWorldId(request.params.id);
    const validationError = validateAuthoredWorldPayload(request.body);

    if (validationError) {
      reply.code(400);
      return { ok: false, error: validationError };
    }

    const authoredPath = getAuthoredWorldPath(worldId);
    const runtimePath = getWorldPath(worldId);
    const backupDir = getWorldBackupDir();
    const timestamp = createTimestamp();
    const authoredJson = normalizeAuthoredWorldPayload(request.body, worldId);
    const runtimeJson = authoredToRuntimeJson(authoredJson);

    await Promise.all([
      ensureDir(getAuthoredWorldsDir()),
      ensureDir(backupDir),
    ]);

    // Backup existing files before overwriting.
    await backupFileIfExists(
      authoredPath,
      backupDir,
      `${worldId}.authored.${timestamp}.json`,
    );

    // Check whether runtime content actually changed to avoid unnecessary writes.
    let runtimeChanged = true;
    if (await fileExists(runtimePath)) {
      try {
        const existing = await readJsonFile(runtimePath);
        if (JSON.stringify(existing) === JSON.stringify(runtimeJson)) {
          runtimeChanged = false;
        }
      } catch {
        // If we can't read, treat as changed.
      }
    }

    if (runtimeChanged) {
      await backupFileIfExists(
        runtimePath,
        backupDir,
        `${worldId}.runtime.${timestamp}.json`,
      );
    }

    // Write runtime first (game client depends on it), then authored.
    if (runtimeChanged) {
      await writeJsonFile(runtimePath, runtimeJson);
    }
    await writeJsonFile(authoredPath, authoredJson);

    invalidateWorldIndex();

    reply.code(200);
    return authoredJson;
  });

  fastify.delete("/api/worlds/:id", async (request, reply) => {
    const worldId = validateWorldId(request.params.id);
    const runtimePath = getWorldPath(worldId);
    const authoredPath = getAuthoredWorldPath(worldId);

    const runtimeExists = await fileExists(runtimePath);
    const authoredExists = await fileExists(authoredPath);

    if (!runtimeExists && !authoredExists) {
      reply.code(404);
      return { ok: false, error: `World "${worldId}" was not found` };
    }

    if (runtimeExists) await unlink(runtimePath);
    if (authoredExists) await unlink(authoredPath);

    invalidateWorldIndex();

    reply.code(200);
    return { ok: true };
  });
}
