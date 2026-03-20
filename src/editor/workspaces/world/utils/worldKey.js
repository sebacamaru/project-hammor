const WORLD_KEY_RE = /^-?\d+,-?\d+$/;

/**
 * @param {number} rx
 * @param {number} ry
 * @returns {string} "rx,ry"
 */
export function makeWorldKey(rx, ry) {
  return `${rx},${ry}`;
}

/**
 * Strict parse — returns null if the key is not a valid world key.
 * @param {string} key
 * @returns {{ rx: number, ry: number } | null}
 */
export function parseWorldKey(key) {
  if (typeof key !== 'string' || !WORLD_KEY_RE.test(key)) return null;
  const i = key.indexOf(',');
  return { rx: Number(key.slice(0, i)), ry: Number(key.slice(i + 1)) };
}

/**
 * @param {*} value
 * @returns {boolean}
 */
export function isWorldKey(value) {
  return typeof value === 'string' && WORLD_KEY_RE.test(value);
}
