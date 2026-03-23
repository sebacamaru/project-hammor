/**
 * Pure functions for resolving authored entity instances against prefab data.
 *
 * Merge strategy:
 * - params: shallow merge ({ ...prefab.params, ...instance.params })
 * - components: shallow merge by key, then shallow merge within each component
 *   e.g. prefab interaction:{trigger:"action"} + instance interaction:{text:"Hi"}
 *        → interaction:{trigger:"action", text:"Hi"}
 *
 * This gives one useful level of override without deep merge complexity.
 */

/**
 * Validates a raw authored entity instance before prefab resolution.
 * @param {object} instance - Raw entity data from map JSON.
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateInstance(instance) {
  if (!instance || typeof instance !== "object") {
    return { ok: false, error: "not a valid object" };
  }
  if (!instance.id || typeof instance.id !== "string") {
    return { ok: false, error: "missing or invalid 'id'" };
  }
  if (typeof instance.x !== "number" || !Number.isFinite(instance.x)) {
    return { ok: false, error: `invalid 'x' for entity "${instance.id}"` };
  }
  if (typeof instance.y !== "number" || !Number.isFinite(instance.y)) {
    return { ok: false, error: `invalid 'y' for entity "${instance.id}"` };
  }
  if (!instance.prefabId && !instance.kind && !instance.components) {
    return {
      ok: false,
      error: `entity "${instance.id}" must have at least one of: prefabId, kind, or components`,
    };
  }
  return { ok: true };
}

/**
 * Validates the resolved (post-merge) entity data.
 * @param {object} resolved - Merged entity data.
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateResolved(resolved) {
  if (!resolved.kind || typeof resolved.kind !== "string") {
    return {
      ok: false,
      error: `entity "${resolved.authoredId}" has no 'kind' after prefab resolution`,
    };
  }
  return { ok: true };
}

/**
 * Resolves an authored entity instance against its prefab (if any).
 * Returns a plain object with the final merged data ready for GameEntity creation.
 *
 * @param {object} instance - Raw entity data from map JSON.
 * @param {import('./PrefabRegistry.js').PrefabRegistry} prefabRegistry
 * @returns {{ authoredId: string, kind: string, x: number, y: number, params: object, components: object }}
 * @throws {Error} If prefabId is specified but not found in the registry.
 */
export function resolveEntity(instance, prefabRegistry) {
  let prefab = null;

  if (instance.prefabId) {
    prefab = prefabRegistry.getPrefab(instance.prefabId);
    if (!prefab) {
      throw new Error(
        `Entity "${instance.id}" references unknown prefab "${instance.prefabId}"`,
      );
    }
  }

  // kind: instance wins, falls back to prefab
  const kind = instance.kind ?? (prefab ? prefab.kind : undefined);

  // params: shallow merge (prefab defaults, then instance overrides)
  const params = {
    ...(prefab?.params ?? {}),
    ...(instance.params ?? {}),
  };

  // components: shallow merge by key, then shallow merge within each component
  const components = mergeComponents(
    prefab?.components ?? {},
    instance.components ?? {},
  );

  const resolved = {
    authoredId: instance.id,
    kind,
    x: instance.x,
    y: instance.y,
    params,
    components,
  };

  // Post-resolve validation
  const check = validateResolved(resolved);
  if (!check.ok) {
    throw new Error(check.error);
  }

  return resolved;
}

/**
 * Merges component maps with two-level shallow merge.
 * For each component key present in either source:
 *   result[key] = { ...prefabComponent[key], ...instanceComponent[key] }
 *
 * @param {object} prefabComponents - Components from the prefab.
 * @param {object} instanceComponents - Components from the instance (overrides).
 * @returns {object} Merged components map.
 */
function mergeComponents(prefabComponents, instanceComponents) {
  const allKeys = new Set([
    ...Object.keys(prefabComponents),
    ...Object.keys(instanceComponents),
  ]);

  const result = {};
  for (const key of allKeys) {
    const prefabVal = prefabComponents[key];
    const instanceVal = instanceComponents[key];

    if (prefabVal && instanceVal) {
      // Both exist: shallow merge within the component
      result[key] = { ...prefabVal, ...instanceVal };
    } else {
      // Only one exists: use whichever is present (copy to avoid mutation)
      result[key] = { ...(instanceVal ?? prefabVal) };
    }
  }

  return result;
}
