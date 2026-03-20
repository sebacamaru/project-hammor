const DEFAULT_GAME_START = { mapId: "test_map", x: 12, y: 12 };

export class ProjectSettings {
  static async load(url = "/content/project.json") {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return ProjectSettings.parse(json);
    } catch (err) {
      console.warn("[ProjectSettings] Failed to load, using defaults:", err.message);
      return { gameStart: { ...DEFAULT_GAME_START } };
    }
  }

  static parse(json) {
    const gs = json?.gameStart;
    const rawX = gs?.x;
    const rawY = gs?.y;
    return {
      gameStart: {
        worldId: (typeof gs?.worldId === "string" && gs.worldId) || null,
        mapId: (typeof gs?.mapId === "string" && gs.mapId) || DEFAULT_GAME_START.mapId,
        x: Number.isFinite(rawX) ? Math.trunc(rawX) : DEFAULT_GAME_START.x,
        y: Number.isFinite(rawY) ? Math.trunc(rawY) : DEFAULT_GAME_START.y,
      },
    };
  }
}
