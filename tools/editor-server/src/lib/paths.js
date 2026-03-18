import path from "node:path";
import { fileURLToPath } from "node:url";

const VALID_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../../../../");

export function getRepoRoot() {
  return repoRoot;
}

// Runtime maps stay here so the current game can keep reading the same path.
export function getMapsDir() {
  return path.join(repoRoot, "content", "maps");
}

// Authored maps are the editor's real source of truth during this transition.
export function getAuthoredMapsDir() {
  return path.join(getMapsDir(), ".authored");
}

// Both authored and runtime backups are written here before overwrites.
export function getMapBackupDir() {
  return path.join(getMapsDir(), ".backup");
}

export function getTilesetsDir() {
  return path.join(repoRoot, "content", "tilesets");
}

// Allows only simple ids so route params can never escape the expected content folders.
export function validateMapId(id) {
  if (typeof id !== "string" || !VALID_ID_PATTERN.test(id)) {
    const error = new Error(`Invalid id "${id}". Expected letters, numbers, "_" or "-".`);
    error.statusCode = 400;
    throw error;
  }

  return id;
}

export function getAuthoredMapPath(id) {
  return path.join(getAuthoredMapsDir(), `${validateMapId(id)}.json`);
}

export function getRuntimeMapPath(id) {
  return path.join(getMapsDir(), `${validateMapId(id)}.json`);
}

export function getTilesetPath(id) {
  return path.join(getTilesetsDir(), `${validateMapId(id)}_tileset.json`);
}
