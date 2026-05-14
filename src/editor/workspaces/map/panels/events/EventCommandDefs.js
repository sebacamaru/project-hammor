/**
 * Registry of supported event command types, matching what the server runtime
 * accepts in `applyInteractionCommands.js` and `GameServer._advancePlayerEvent()`.
 *
 * Each entry has:
 *  - label: human-readable name shown in the editor
 *  - defaults: object cloned when adding a new command of this type
 *  - fields: array of { key, label, type, ...constraints } used by the field renderer
 *  - summary(cmd): one-line preview shown in the card header (defensive)
 *  - firstFocusField: key of the field to focus after adding (or null)
 *
 * Field types: text, textarea, number (min/max), checkbox, select (options),
 * entitySelect (dropdown of authored entity ids in the current map).
 *
 * Direction values are lowercase strings — the runtime does not accept numbers
 * or "self" targets.
 *
 * Optional fields (`optional: true`) are pruned from the command object when
 * left empty during edit, so authored JSON does not carry blank keys like
 * `speaker: ""`. New-command defaults likewise omit optional empties — see
 * `message.defaults` which intentionally does not include `speaker`.
 */
export const EVENT_COMMAND_DEFS = {
  message: {
    label: "Message",
    defaults: { type: "message", text: "" },
    fields: [
      { key: "text", label: "Text", type: "textarea" },
      { key: "speaker", label: "Speaker", type: "text", optional: true },
    ],
    summary: (cmd) =>
      cmd?.text ? `“${truncate(String(cmd.text), 40)}”` : "empty",
    firstFocusField: "text",
  },

  wait: {
    label: "Wait",
    defaults: { type: "wait", ms: 300 },
    fields: [
      { key: "ms", label: "Milliseconds", type: "number", min: 0 },
    ],
    summary: (cmd) => `${Number(cmd?.ms) || 0}ms`,
    firstFocusField: "ms",
  },

  inputLock: {
    label: "Input Lock",
    defaults: { type: "inputLock", move: true, interact: true },
    fields: [
      { key: "move", label: "Lock Movement", type: "checkbox" },
      { key: "interact", label: "Lock Interaction", type: "checkbox" },
    ],
    summary: (cmd) =>
      `move ${cmd?.move ? "on" : "off"}, interact ${cmd?.interact ? "on" : "off"}`,
    firstFocusField: null,
  },

  faceEntity: {
    label: "Face Entity",
    defaults: { type: "faceEntity", target: "", dir: "down" },
    fields: [
      { key: "target", label: "Target", type: "entitySelect" },
      { key: "dir", label: "Direction", type: "select",
        options: ["down", "left", "right", "up"] },
    ],
    summary: (cmd) =>
      cmd?.target ? `${cmd.target} → ${cmd.dir ?? "?"}` : "missing target",
    firstFocusField: "target",
  },

  moveEntity: {
    label: "Move Entity",
    defaults: { type: "moveEntity", target: "", dir: "down", steps: 1, speed: 3 },
    fields: [
      { key: "target", label: "Target", type: "entitySelect" },
      { key: "dir", label: "Direction", type: "select",
        options: ["down", "left", "right", "up"] },
      { key: "steps", label: "Steps", type: "number", min: 1, max: 8 },
      { key: "speed", label: "Speed", type: "number", min: 1, max: 10 },
    ],
    summary: (cmd) =>
      cmd?.target
        ? `${cmd.target} ${cmd.dir ?? "?"} ×${cmd.steps ?? 1}, speed ${cmd.speed ?? 1}`
        : "missing target",
    firstFocusField: "target",
  },
};

/** Order in which command types appear in the Add dropdown. */
export const COMMAND_TYPES_IN_ADD_ORDER = [
  "message",
  "wait",
  "inputLock",
  "faceEntity",
  "moveEntity",
];

/** Trims a string to `max` chars, appending an ellipsis when it had to cut. */
function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, Math.max(0, max - 1)) + "…";
}
