import { AnimatedSprite } from "pixi.js";
import { sliceSpriteSheet } from "../utils/SpriteSheetSlicer.js";
import { PLAYER_ANIMATIONS, DIRECTION_NAMES } from "./PlayerAnimations.js";
import { AssetManager } from "../assets/AssetsManager.js";

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
    this.sprite.x = Math.floor(player.prevX + (player.x - player.prevX) * alpha);
    this.sprite.y = Math.floor(player.prevY + (player.y - player.prevY) * alpha);

    const dirName = DIRECTION_NAMES[player.direction];
    const animName = player.moving ? `walk_${dirName}` : `idle_${dirName}`;
    this.play(animName);
  }

  destroy() {
    this.sprite.destroy();
  }
}
