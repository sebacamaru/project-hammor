import { readdir } from "node:fs/promises";
import {
  getAuthoredWorldsDir,
  getWorldsDir,
  getAuthoredWorldPath,
  getWorldPath,
} from "./paths.js";
import { fileExists, readJsonFile } from "./fs-utils.js";
import { runtimeToAuthoredJson } from "./world-codecs.js";

/** @type {Map<string, string> | null} mapId → worldId */
let mapToWorldIndex = null;

/**
 * Reads all world files (authored first, runtime fallback) and builds
 * a mapId → worldId lookup.  Reuses the same resolution order as the
 * worlds route so both stay consistent.
 */
async function buildWorldIndex() {
  const index = new Map();

  // Collect unique world ids from both directories.
  let ids;
  try {
    const [authoredIds, runtimeIds] = await Promise.all([
      listJsonIds(getAuthoredWorldsDir()),
      listJsonIds(getWorldsDir()),
    ]);
    ids = [...new Set([...authoredIds, ...runtimeIds])].sort();
  } catch (err) {
    console.warn("[world-index] Failed to list world directories:", err.message);
    return index;
  }

  for (const id of ids) {
    let authored = null;
    try {
      const authoredPath = getAuthoredWorldPath(id);
      if (await fileExists(authoredPath)) {
        authored = await readJsonFile(authoredPath);
      } else {
        const runtimePath = getWorldPath(id);
        if (await fileExists(runtimePath)) {
          const raw = await readJsonFile(runtimePath);
          if (raw && Array.isArray(raw.maps)) {
            authored = runtimeToAuthoredJson(raw);
          }
        }
      }
    } catch (err) {
      console.warn(`[world-index] Failed to read world "${id}":`, err.message);
      continue;
    }

    if (!authored || !authored.cells || typeof authored.cells !== "object") {
      continue;
    }

    for (const cell of Object.values(authored.cells)) {
      const mapId = cell?.mapId;
      if (typeof mapId !== "string" || !mapId) continue;

      if (index.has(mapId)) {
        console.warn(
          `[world-index] mapId "${mapId}" appears in multiple worlds ("${index.get(mapId)}" and "${id}") — keeping first`,
        );
        continue;
      }
      index.set(mapId, id);
    }
  }

  return index;
}

/** Returns json file ids from a directory (same logic as worlds.js). */
async function listJsonIds(dirPath) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(
        (e) =>
          e.isFile() &&
          e.name.endsWith(".json") &&
          !e.name.startsWith(".") &&
          !e.name.includes(".runtime."),
      )
      .map((e) => e.name.replace(/\.json$/i, ""));
  } catch (err) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}

/**
 * Returns the worldId that contains `mapId`, or null.
 * Lazily builds and caches the index on first call.
 */
export async function findWorldIdForMap(mapId) {
  if (!mapToWorldIndex) {
    mapToWorldIndex = await buildWorldIndex();
  }
  return mapToWorldIndex.get(mapId) ?? null;
}

/** Drops the cached index so the next lookup rebuilds it. */
export function invalidateWorldIndex() {
  mapToWorldIndex = null;
}
