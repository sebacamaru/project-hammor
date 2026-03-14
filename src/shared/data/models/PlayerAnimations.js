export const PLAYER_ANIMATIONS = {
  idle_down: { row: 2, speed: 0.05 },
  walk_down: { row: 6, speed: 0.15 },
  idle_left: { row: 1, speed: 0.05 },
  walk_left: { row: 5, speed: 0.15 },
  idle_right: { row: 0, speed: 0.05 },
  walk_right: { row: 4, speed: 0.15 },
  idle_up: { row: 3, speed: 0.05 },
  walk_up: { row: 7, speed: 0.15 },
};

// Maps Entity.direction (0=down, 1=left, 2=right, 3=up) to name string
export const DIRECTION_NAMES = ["down", "left", "right", "up"];
