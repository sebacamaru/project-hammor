/**
 * Waits for N animation frames before resolving.
 * Useful to let the browser apply layout/style changes before reading geometry.
 *
 * @param {number} n  Number of frames to wait (default 1)
 */
export async function waitFrames(n = 1) {
  while (n--) {
    await new Promise(requestAnimationFrame);
  }
}
