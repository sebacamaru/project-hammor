/**
 * Dev server manager — manages the game server child process lifecycle.
 *
 * Exposes two public functions:
 *   getDevServerStatus() — returns current state snapshot
 *   restartDevServer()   — stops any running instance and spawns a fresh one,
 *                          waiting for the health endpoint before resolving
 *
 * Singleton: module-level state is shared across all importers.
 */

import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const _currentDir = path.dirname(fileURLToPath(import.meta.url));
// tools/editor-server/src/lib/ → ../../../../ = project root
const PROJECT_ROOT = path.resolve(_currentDir, "../../../../");

const HEALTH_HOST = "127.0.0.1";
const HEALTH_PORT = 3002;
const HEALTH_POLL_MS = 250;
const HEALTH_TIMEOUT_MS = 10_000;
const KILL_GRACE_MS = 3_000;

/** @type {"stopped"|"starting"|"running"|"stopping"|"error"} */
let _status = "stopped";
/** @type {import("node:child_process").ChildProcess|null} */
let _child = null;
/** @type {string|null} */
let _lastError = null;
/** @type {Date|null} */
let _startedAt = null;
/** @type {Promise<void>|null} — serialises concurrent restart calls */
let _restartLock = null;
/** @type {boolean} — true while stopDevServer() is in progress; tells the exit handler not to classify the exit as a crash */
let _stopRequested = false;

/**
 * Returns a snapshot of the current game server process state.
 * @returns {{ status: string, lastError: string|null, startedAt: Date|null }}
 */
export function getDevServerStatus() {
  return { status: _status, lastError: _lastError, startedAt: _startedAt };
}

/**
 * Restarts the game server process.
 *
 * If a restart is already in progress the call queues behind it and returns
 * the resulting status without starting a second spawn.
 *
 * Flow:
 *   1. Stop existing child (SIGTERM, force-kill after KILL_GRACE_MS)
 *   2. Spawn `bun server/src/index.js` from project root
 *   3. Wait 200ms initial delay, then poll GET /health every HEALTH_POLL_MS
 *   4. Resolve when 200 is received; reject after HEALTH_TIMEOUT_MS
 *
 * @returns {Promise<{ status: string }>}
 */
export async function restartDevServer() {
  if (_restartLock) {
    await _restartLock;
    return { status: _status };
  }

  let resolve;
  _restartLock = new Promise((r) => {
    resolve = r;
  });

  try {
    await _stopExistingChild();
    await _spawnChild();
    await _waitForHealth();
    _status = "running";
    _startedAt = new Date();
    _lastError = null;
  } catch (err) {
    _status = "error";
    _lastError = err.message;
    throw err;
  } finally {
    _restartLock = null;
    resolve();
  }

  return { status: _status };
}

/**
 * Stops the game server process if one is running.
 *
 * If a restart is in progress, waits for it to finish before stopping — returning
 * early would leave a just-restarted server running.
 *
 * Sets _stopRequested = true before sending the kill signal so that the child
 * exit handler treats the exit as intentional (not a crash), regardless of exit
 * code or signal. This makes the stopped state deterministic.
 *
 * Flow:
 *   1. Wait for any in-progress operation lock to release
 *   2. If no child is running, normalise state and return
 *   3. Acquire the operation lock
 *   4. Set _stopRequested = true
 *   5. Stop the child via _stopExistingChild() (SIGTERM + grace-kill)
 *   6. Authoritative final state: stopped / null / null
 *
 * @returns {Promise<{ status: string }>}
 */
export async function stopDevServer() {
  if (_restartLock) {
    await _restartLock;
  }

  if (!_child || _child.exitCode !== null) {
    _child = null;
    _startedAt = null;
    return { status: _status };
  }

  let resolve;
  _restartLock = new Promise((r) => { resolve = r; });

  try {
    _stopRequested = true;
    await _stopExistingChild();
    _status = "stopped";
    _child = null;
    _startedAt = null;
    _lastError = null;
  } catch (err) {
    _status = "error";
    _lastError = err.message;
    throw err;
  } finally {
    _stopRequested = false;
    _restartLock = null;
    resolve();
  }

  return { status: _status };
}

/**
 * Stops the existing child process if one is running.
 * Sends SIGTERM and waits for exit; force-kills after KILL_GRACE_MS.
 * Clears _child and _startedAt on completion.
 * @returns {Promise<void>}
 */
async function _stopExistingChild() {
  if (!_child || _child.exitCode !== null) {
    _child = null;
    _startedAt = null;
    return;
  }

  _status = "stopping";
  _child.kill("SIGTERM");

  await new Promise((resolve) => {
    const child = _child;

    const timer = setTimeout(() => {
      if (child && child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }, KILL_GRACE_MS);

    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });

  _child = null;
  _startedAt = null;
}

/**
 * Spawns a fresh game server child process.
 * Waits for the "spawn" event before resolving so that spawn errors (e.g. bun
 * not in PATH) are caught immediately rather than silently ignored.
 * Sets _child only after a successful spawn. Pipes stdout/stderr to the
 * editor-server console prefixed with [game-server].
 * @returns {Promise<void>}
 */
async function _spawnChild() {
  _status = "starting";
  _lastError = null;

  await new Promise((resolve, reject) => {
    const child = spawn("bun", ["server/src/index.js"], {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let settled = false;

    const onError = (err) => {
      if (settled) return;
      settled = true;
      _status = "error";
      _lastError = err.message;
      _child = null;
      reject(err);
    };

    const onSpawn = () => {
      if (settled) return;
      settled = true;
      _child = child;

      child.stdout.on("data", (chunk) =>
        process.stdout.write(`[game-server] ${chunk}`),
      );
      child.stderr.on("data", (chunk) =>
        process.stderr.write(`[game-server] ${chunk}`),
      );

      child.on("exit", (code, signal) => {
        const wasRunningLike =
          _status === "running" ||
          _status === "starting" ||
          _status === "stopping";

        if (wasRunningLike) {
          if (_stopRequested || code === 0) {
            // Intentional stop (flagged by stopDevServer) or clean exit — not a crash.
            _status = "stopped";
            _lastError = null;
          } else {
            _status = "error";
            _lastError =
              code !== null
                ? `Process exited with code ${code}`
                : `Process exited due to signal ${signal ?? "unknown"}`;
          }
        }

        _startedAt = null;
        _child = null;
      });

      resolve();
    };

    child.once("error", onError);
    child.once("spawn", onSpawn);
  });
}

/**
 * Waits for the game server health endpoint to respond with HTTP 200.
 * Starts polling after a 200ms initial delay to give the process time to bind.
 * Rejects immediately if the child process exits before the healthcheck succeeds,
 * avoiding the full HEALTH_TIMEOUT_MS wait on an instant crash.
 * Rejects after HEALTH_TIMEOUT_MS if no successful response is received.
 * @returns {Promise<void>}
 */
function _waitForHealth() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    let settled = false;
    let timeoutId = null;
    let exitHandler = null;

    const finishResolve = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const finishReject = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (_child && exitHandler) {
        _child.off("exit", exitHandler);
      }
    };

    // Fail immediately if the child exits before becoming healthy
    exitHandler = (code, signal) => {
      finishReject(
        new Error(
          code !== null
            ? `Game server exited before healthcheck (code ${code})`
            : `Game server exited before healthcheck (signal ${signal ?? "unknown"})`,
        ),
      );
    };

    if (_child) {
      _child.on("exit", exitHandler);
    }

    const poll = () => {
      if (settled) return;

      if (!_child) {
        finishReject(new Error("Game server process is not running"));
        return;
      }

      if (Date.now() >= deadline) {
        finishReject(
          new Error(`Game server did not respond within ${HEALTH_TIMEOUT_MS}ms`),
        );
        return;
      }

      const req = http.get(
        { host: HEALTH_HOST, port: HEALTH_PORT, path: "/health" },
        (res) => {
          res.resume();
          if (res.statusCode === 200) {
            finishResolve();
          } else {
            timeoutId = setTimeout(poll, HEALTH_POLL_MS);
          }
        },
      );

      req.on("error", () => {
        if (!settled) {
          timeoutId = setTimeout(poll, HEALTH_POLL_MS);
        }
      });

      req.setTimeout(HEALTH_POLL_MS, () => req.destroy());
    };

    // Initial delay before first poll — gives the process time to start binding
    timeoutId = setTimeout(poll, 200);
  });
}
