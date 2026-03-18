import { mkdir, readFile, stat, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

// Reads and parses a JSON file into a plain object.
export async function readJsonFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function writeJsonFile(filePath, value) {
  const dirPath = path.dirname(filePath);
  await ensureDir(dirPath);
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

// Small helper so routes can branch on missing files without duplicating ENOENT handling.
export async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

// Uses an ISO-based timestamp but strips characters that are awkward in filenames.
export function createTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

// Copies the current file aside before we overwrite it, if that file already exists.
export async function backupFileIfExists(filePath, backupDir, backupName) {
  if (!(await fileExists(filePath))) {
    return null;
  }

  await ensureDir(backupDir);
  const backupPath = path.join(backupDir, backupName);
  await copyFile(filePath, backupPath);
  return backupPath;
}
