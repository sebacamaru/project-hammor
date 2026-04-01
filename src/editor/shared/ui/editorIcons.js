/**
 * Icon name → column index in editor_icons.webp (16px per slot, single row).
 * Adjust indices to match the actual sprite sheet layout.
 */
export const ICON_MAP = {
  save:        0,
  undo:        1,
  redo:        2,
  pencil:      3,
  eraser:      4,
  eyedropper:  5,
  play:        4,
  stop:        5,
  load:        6,
  // slots 7–19 reserved
};

/**
 * Returns the CSS background-position style for the named icon,
 * or null if the name is not in ICON_MAP (avoids silently showing wrong icon).
 * @param {string} name
 * @returns {{ backgroundPosition: string } | null}
 */
export function getIconStyle(name) {
  if (!(name in ICON_MAP)) return null;
  const col = ICON_MAP[name];
  return { backgroundPosition: `${-(col * 16)}px 0px` };
}

/**
 * Creates a <span> element styled as an editor icon sprite.
 * Returns null if the icon name is not registered.
 * @param {string} name
 * @returns {HTMLSpanElement | null}
 */
export function createIconEl(name) {
  const style = getIconStyle(name);
  if (!style) return null;
  const span = document.createElement("span");
  span.className = "editor-icon";
  Object.assign(span.style, style);
  return span;
}
