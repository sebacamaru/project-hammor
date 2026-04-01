import { readdir } from "node:fs/promises";
import {
  backupFileIfExists,
  createTimestamp,
  ensureDir,
  fileExists,
  readJsonFile,
  writeJsonFile,
} from "../lib/fs-utils.js";
import {
  getTilesetBackupDir,
  getTilesetPath,
  getTilesetsDir,
  validateTilesetId,
} from "../lib/paths.js";

// Exposes tileset endpoints so the editor can inspect and update tilesets.
export async function registerTilesetRoutes(fastify) {
  fastify.get("/api/tilesets", async () => {
    let entries = [];

    try {
      entries = await readdir(getTilesetsDir(), { withFileTypes: true });
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }

    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith("_tileset.json"))
      .map((entry) => {
        const id = entry.name.replace(/_tileset\.json$/i, "");
        return {
          id,
          path: `content/tilesets/${entry.name}`,
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  });

  fastify.get("/api/tilesets/:id", async (request, reply) => {
    const tilesetId = validateTilesetId(request.params.id);
    const tilesetPath = getTilesetPath(tilesetId);

    if (!(await fileExists(tilesetPath))) {
      reply.code(404);
      return {
        ok: false,
        error: `Tileset "${tilesetId}" was not found`,
      };
    }

    return readJsonFile(tilesetPath);
  });

  fastify.put("/api/tilesets/:id", async (request, reply) => {
    const tilesetId = validateTilesetId(request.params.id);
    const tilesetPath = getTilesetPath(tilesetId);

    if (!Array.isArray(request.body?.groups)) {
      reply.code(400);
      return { ok: false, error: "Request body must contain a groups array" };
    }

    if (!(await fileExists(tilesetPath))) {
      reply.code(404);
      return {
        ok: false,
        error: `Tileset "${tilesetId}" was not found`,
      };
    }

    const tileset = await readJsonFile(tilesetPath);

    // Backup before overwriting
    const backupDir = getTilesetBackupDir();
    const timestamp = createTimestamp();
    await ensureDir(backupDir);
    await backupFileIfExists(
      tilesetPath,
      backupDir,
      `${tilesetId}_tileset.${timestamp}.json`,
    );

    // Replace only editor.groups, preserve everything else
    tileset.editor = tileset.editor ?? {};
    tileset.editor.groups = request.body.groups;

    await writeJsonFile(tilesetPath, tileset);

    reply.code(200);
    return { ok: true };
  });
}
