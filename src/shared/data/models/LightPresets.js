/**
 * Built-in light presets for common use cases.
 * Each preset contains only visual/authoring settings — no id, x, y, or enabled.
 * `enabled` is intentionally excluded so applying a preset never silently
 * re-enables a disabled light.
 */
export const LIGHT_PRESETS = [
  {
    key: "torch",
    label: "Torch",
    values: {
      color: "#ffb45c",
      intensity: 1.2,
      radius: 96,
      falloff: 0.75,
      castShadows: false,
      flicker: "none",
    },
  },
  {
    key: "candle",
    label: "Candle",
    values: {
      color: "#ffd27a",
      intensity: 0.7,
      radius: 48,
      falloff: 0.85,
      castShadows: false,
      flicker: "none",
    },
  },
  {
    key: "warmLamp",
    label: "Warm Lamp",
    values: {
      color: "#ffe1a8",
      intensity: 1.5,
      radius: 140,
      falloff: 0.65,
      castShadows: false,
      flicker: "none",
    },
  },
  {
    key: "magicBlue",
    label: "Magic Blue",
    values: {
      color: "#6ec8ff",
      intensity: 1.1,
      radius: 110,
      falloff: 0.7,
      castShadows: false,
      flicker: "none",
    },
  },
];
