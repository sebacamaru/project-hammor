/** Valid values for lighting.ambientMode. */
export const VALID_AMBIENT_MODES = ["cycle", "fixed"];

/** Valid values for a light's type field. */
export const VALID_LIGHT_TYPES = ["point"];

/** Valid values for a light's flicker field. */
export const VALID_FLICKER_MODES = ["none"];

/** Default lighting block applied to maps that have no lighting section. */
export const DEFAULT_LIGHTING = Object.freeze({
  ambientMode: "cycle",
  fixedAmbient: Object.freeze({ color: "#000000", intensity: 0 }),
  lights: Object.freeze([]),
});

/** Default values for a single light entry. */
export const DEFAULT_LIGHT = Object.freeze({
  id: "",
  x: 0,
  y: 0,
  type: "point",
  color: "#ffffff",
  intensity: 1,
  radius: 96,
  falloff: 0.7,
  enabled: true,
  castShadows: false,
  flicker: "none",
});

/**
 * Normalizes a single light entry, filling missing or invalid fields from defaults.
 * Always returns a new object — never mutates the input.
 * @param {*} input - Raw light object (or anything).
 * @returns {object} A fully populated light object.
 */
export function normalizeLight(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ...DEFAULT_LIGHT };
  }

  const id = typeof input.id === "string" ? input.id : DEFAULT_LIGHT.id;
  const x = Number.isFinite(input.x) ? input.x : DEFAULT_LIGHT.x;
  const y = Number.isFinite(input.y) ? input.y : DEFAULT_LIGHT.y;

  const type = VALID_LIGHT_TYPES.includes(input.type)
    ? input.type
    : DEFAULT_LIGHT.type;

  const color =
    typeof input.color === "string" && input.color.startsWith("#")
      ? input.color
      : DEFAULT_LIGHT.color;

  const intensity = Number.isFinite(input.intensity) && input.intensity >= 0
    ? input.intensity
    : DEFAULT_LIGHT.intensity;

  const radius = Number.isFinite(input.radius) && input.radius >= 0
    ? input.radius
    : DEFAULT_LIGHT.radius;

  const falloff = Number.isFinite(input.falloff)
    ? Math.max(0, Math.min(1, input.falloff))
    : DEFAULT_LIGHT.falloff;

  const enabled = typeof input.enabled === "boolean"
    ? input.enabled
    : DEFAULT_LIGHT.enabled;

  const castShadows = typeof input.castShadows === "boolean"
    ? input.castShadows
    : DEFAULT_LIGHT.castShadows;

  const flicker = VALID_FLICKER_MODES.includes(input.flicker)
    ? input.flicker
    : DEFAULT_LIGHT.flicker;

  return { id, x, y, type, color, intensity, radius, falloff, enabled, castShadows, flicker };
}

/**
 * Normalizes a full lighting block, filling missing or invalid fields from defaults.
 * Always returns a new object with fresh nested references — safe to mutate.
 * @param {*} input - Raw lighting object (or null/undefined).
 * @returns {object} A fully populated lighting object.
 */
export function normalizeLighting(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ambientMode: DEFAULT_LIGHTING.ambientMode,
      fixedAmbient: { ...DEFAULT_LIGHTING.fixedAmbient },
      lights: [],
    };
  }

  const ambientMode = VALID_AMBIENT_MODES.includes(input.ambientMode)
    ? input.ambientMode
    : DEFAULT_LIGHTING.ambientMode;

  const rawAmbient = input.fixedAmbient;
  const fixedAmbient = {
    color:
      rawAmbient && typeof rawAmbient === "object" &&
      typeof rawAmbient.color === "string" && rawAmbient.color.startsWith("#")
        ? rawAmbient.color
        : DEFAULT_LIGHTING.fixedAmbient.color,
    intensity:
      rawAmbient && typeof rawAmbient === "object" &&
      Number.isFinite(rawAmbient.intensity) && rawAmbient.intensity >= 0
        ? Math.min(1, rawAmbient.intensity)
        : DEFAULT_LIGHTING.fixedAmbient.intensity,
  };

  const lights = Array.isArray(input.lights)
    ? input.lights
        .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
        .map(normalizeLight)
    : [];

  return { ambientMode, fixedAmbient, lights };
}
