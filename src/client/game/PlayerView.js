import { AnimatedSprite } from "pixi.js";
import { sliceSpriteSheet } from "../../shared/assets/SpriteSheetSlicer.js";
import { PLAYER_ANIMATIONS, DIRECTION_NAMES } from "../../shared/data/models/PlayerAnimations.js";
import { AssetManager } from "../../shared/assets/AssetsManager.js";
import { DEBUG_FLAGS } from "../../shared/core/Config.js";

export class PlayerView {
  constructor(parentContainer) {
    const baseTex = AssetManager.texture("player_test");
    const frames = sliceSpriteSheet(baseTex, 16, 16, 4, 31);

    // Build animation map: name → Texture[]
    this.animations = {};
    for (const [name, config] of Object.entries(PLAYER_ANIMATIONS)) {
      this.animations[name] = frames[config.row];
    }

    // Create AnimatedSprite starting with idle_down
    this.sprite = new AnimatedSprite(this.animations["idle_down"]);
    this.sprite.animationSpeed = PLAYER_ANIMATIONS["idle_down"].speed;
    this.sprite.play();

    this.currentAnim = "idle_down";

    parentContainer.addChild(this.sprite);
  }

  play(name) {
    if (this.currentAnim === name) return;
    this.currentAnim = name;
    const config = PLAYER_ANIMATIONS[name];
    this.sprite.textures = this.animations[name];
    this.sprite.animationSpeed = config.speed;
    this.sprite.play();
  }

  updateFromEntity(player, alpha) {
    let ix, iy;
    if (DEBUG_FLAGS.NET_ENABLE_CLIENT_PREDICTION) {
      // Prediction ON: direct position, no interpolation.
      // Prediction runs every tick — no gap to smooth over.
      ix = Math.round(player.x);
      iy = Math.round(player.y);
    } else if (DEBUG_FLAGS.NET_ENABLE_REMOTE_INTERPOLATION) {
      // Prediction OFF + interp ON: interpolate between snapshots (~150ms)
      ix = Math.round(player.prevX + (player.x - player.prevX) * alpha);
      iy = Math.round(player.prevY + (player.y - player.prevY) * alpha);
    } else {
      // Prediction OFF + interp OFF: snap to last server position
      ix = Math.round(player.x);
      iy = Math.round(player.y);
    }
    this.sprite.x = ix - 8;   // center horizontally from feet
    this.sprite.y = iy - 16;  // sprite above feet

    const dirName = DIRECTION_NAMES[player.direction];
    const animName = player.moving ? `walk_${dirName}` : `idle_${dirName}`;
    this.play(animName);
  }

  destroy() {
    this.sprite.destroy();
  }
}
