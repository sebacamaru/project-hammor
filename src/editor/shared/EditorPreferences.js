const STORAGE_KEY = "editor.preferences";

/**
 * Reads the raw preferences object from localStorage.
 * Returns {} on any error or if the stored value is not a plain object.
 * @returns {object}
 */
function readRawPreferences() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw || typeof raw !== "object") return {};
    return raw;
  } catch {
    return {};
  }
}

/**
 * Writes the preferences object to localStorage.
 * Silently swallows any errors (e.g. storage quota exceeded, private browsing).
 * @param {object} prefs
 */
function writeRawPreferences(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // intentionally silent
  }
}

/**
 * Sanitizes a raw lightingPreview value against a set of defaults.
 * - enabled must be boolean
 * - ambientColor must be a #-prefixed string
 * - ambientIntensity must be a finite number, clamped to [0, 1]
 * @param {*} input
 * @param {{ enabled: boolean, ambientColor: string, ambientIntensity: number }} defaults
 * @returns {{ enabled: boolean, ambientColor: string, ambientIntensity: number }}
 */
function sanitizeLightingPreview(input, defaults) {
  return {
    enabled:
      typeof input?.enabled === "boolean" ? input.enabled : defaults.enabled,
    ambientColor:
      typeof input?.ambientColor === "string" &&
      input.ambientColor.startsWith("#")
        ? input.ambientColor
        : defaults.ambientColor,
    ambientIntensity:
      typeof input?.ambientIntensity === "number" &&
      isFinite(input.ambientIntensity)
        ? Math.min(1, Math.max(0, input.ambientIntensity))
        : defaults.ambientIntensity,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the full raw editor preferences object.
 * @returns {object}
 */
export function getEditorPreferences() {
  return readRawPreferences();
}

/**
 * Replaces the full editor preferences object.
 * @param {object} nextPrefs
 */
export function setEditorPreferences(nextPrefs) {
  writeRawPreferences(nextPrefs);
}

/**
 * Returns the persisted map lighting preview preferences, sanitized and merged
 * against the provided defaults. Always returns a valid object.
 * @param {{ enabled: boolean, ambientColor: string, ambientIntensity: number }} defaults
 * @returns {{ enabled: boolean, ambientColor: string, ambientIntensity: number }}
 */
export function getMapLightingPreviewPreferences(defaults) {
  const prefs = readRawPreferences();
  return sanitizeLightingPreview(prefs?.map?.lightingPreview, defaults);
}

/**
 * Persists the map lighting preview preferences, deep-merging into the existing
 * stored prefs so other branches (e.g. map.grid, ui.panels) are preserved.
 * Sanitizes the value before writing.
 * @param {{ enabled: boolean, ambientColor: string, ambientIntensity: number }} preview
 * @param {{ enabled: boolean, ambientColor: string, ambientIntensity: number }} defaults
 */
export function setMapLightingPreviewPreferences(preview, defaults) {
  const prefs = readRawPreferences();
  const sanitized = sanitizeLightingPreview(preview, defaults);
  writeRawPreferences({
    ...prefs,
    map: {
      ...prefs.map,
      lightingPreview: sanitized,
    },
  });
}
