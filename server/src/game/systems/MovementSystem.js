export class MovementSystem {
  update(players, dt, config) {
    if (!config?.playerSpeed || dt <= 0) return;

    const speed = config.playerSpeed;
    const distance = speed * (dt / 1000);

    for (const player of players.values()) {
      const { input } = player;
      let dx = 0;
      let dy = 0;

      if (input.left) dx -= 1;
      if (input.right) dx += 1;
      if (input.up) dy -= 1;
      if (input.down) dy += 1;

      if (dx === 0 && dy === 0) {
        player.vx = 0;
        player.vy = 0;
        continue;
      }

      if (dx !== 0 && dy !== 0) {
        const len = Math.hypot(dx, dy);
        dx /= len;
        dy /= len;
      }

      player.vx = dx * speed;
      player.vy = dy * speed;
      player.x += dx * distance;
      player.y += dy * distance;

      if (Math.abs(dx) > Math.abs(dy)) {
        player.facing = dx < 0 ? "left" : "right";
      } else {
        player.facing = dy < 0 ? "up" : "down";
      }
    }
  }
}
