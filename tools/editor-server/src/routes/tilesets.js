import { readdir } from "node:fs/promises";
import { fileExists, readJsonFile } from "../lib/fs-utils.js";
import { getTilesetPath, getTilesetsDir, validateMapId } from "../lib/paths.js";

// Exposes simple read-only tileset endpoints so the editor can inspect available tilesets.
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
    const tilesetId = validateMapId(request.params.id);
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
}
