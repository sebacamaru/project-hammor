import { readdir } from "node:fs/promises";
import {
  getAuthoredMapPath,
  getAuthoredMapsDir,
  getMapBackupDir,
  getMapsDir,
  getRuntimeMapPath,
  validateMapId,
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
  normalizeAuthoredPayload,
  runtimeToAuthoredJson,
  validateAuthoredPayload,
} from "../lib/map-codecs.js";

// Returns map ids from plain json files inside a content directory.
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

// Reads the meta block from a single map file (authored first, runtime fallback).
// Returns { id, name, width, height } — never throws.
async function readMapMeta(id) {
  const fallback = { id, name: id, width: null, height: null };
  try {
    const authoredPath = getAuthoredMapPath(id);
    const runtimePath = getRuntimeMapPath(id);

    let json = null;
    if (await fileExists(authoredPath)) {
      json = await readJsonFile(authoredPath);
    } else if (await fileExists(runtimePath)) {
      json = await readJsonFile(runtimePath);
    }

    // Authored format: meta.width/height; runtime format: top-level width/height
    const meta = json.meta ?? json;
    if (!meta) return fallback;

    return {
      id,
      name: meta.name ?? meta.id ?? id,
      width: typeof meta.width === "number" ? meta.width : null,
      height: typeof meta.height === "number" ? meta.height : null,
    };
  } catch {
    return fallback;
  }
}

// Exposes the minimal list/load/save map API used by the editor.
export async function registerMapRoutes(fastify) {
  fastify.get("/api/maps", async () => {
    const [authoredIds, runtimeIds] = await Promise.all([
      listJsonFileIds(getAuthoredMapsDir()),
      listJsonFileIds(getMapsDir()),
    ]);
    const ids = [...new Set([...authoredIds, ...runtimeIds])].sort();

    return Promise.all(ids.map((id) => readMapMeta(id)));
  });

  fastify.get("/api/maps/:id", async (request, reply) => {
    const mapId = validateMapId(request.params.id);
    const authoredPath = getAuthoredMapPath(mapId);
    const runtimePath = getRuntimeMapPath(mapId);

    if (await fileExists(authoredPath)) {
      return readJsonFile(authoredPath);
    }

    if (await fileExists(runtimePath)) {
      const runtimeJson = await readJsonFile(runtimePath);
      return runtimeToAuthoredJson(runtimeJson);
    }

    reply.code(404);
    return {
      ok: false,
      error: `Map "${mapId}" was not found`,
    };
  });

  fastify.put("/api/maps/:id", async (request, reply) => {
    const mapId = validateMapId(request.params.id);
    const validationError = validateAuthoredPayload(request.body);

    if (validationError) {
      reply.code(400);
      return { ok: false, error: validationError };
    }

    const authoredPath = getAuthoredMapPath(mapId);
    const runtimePath = getRuntimeMapPath(mapId);
    const backupDir = getMapBackupDir();
    const timestamp = createTimestamp();
    const authoredJson = normalizeAuthoredPayload(mapId, request.body);
    let runtimeJson;

    try {
      runtimeJson = authoredToRuntimeJson(authoredJson);
    } catch (error) {
      reply.code(400);
      return {
        ok: false,
        error: `Invalid map payload: ${error.message}`,
      };
    }

    await Promise.all([
      ensureDir(getAuthoredMapsDir()),
      ensureDir(backupDir),
    ]);

    await backupFileIfExists(
      authoredPath,
      backupDir,
      `${mapId}.authored.${timestamp}.json`,
    );
    await backupFileIfExists(
      runtimePath,
      backupDir,
      `${mapId}.runtime.${timestamp}.json`,
    );

    await writeJsonFile(authoredPath, authoredJson);
    await writeJsonFile(runtimePath, runtimeJson);

    reply.code(200);
    return { ok: true };
  });
}
