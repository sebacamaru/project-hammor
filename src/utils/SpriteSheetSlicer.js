import { Texture, Rectangle } from "pixi.js";

/**
 * Slices a spritesheet texture into a 2D array of sub-textures.
 * @param {Texture} baseTexture - The full spritesheet texture
 * @param {number} frameW - Width of a single frame
 * @param {number} frameH - Height of a single frame
 * @param {number} cols - Number of columns
 * @param {number} rows - Number of rows
 * @returns {Texture[][]} frames[row][col]
 */
export function sliceSpriteSheet(baseTexture, frameW, frameH, cols, rows) {
  const frames = [];

  for (let row = 0; row < rows; row++) {
    const rowFrames = [];
    for (let col = 0; col < cols; col++) {
      const frame = new Rectangle(col * frameW, row * frameH, frameW, frameH);
      rowFrames.push(
        new Texture({ source: baseTexture.source, frame }),
      );
    }
    frames.push(rowFrames);
  }

  return frames;
}
