import { Container, Graphics, Text } from "pixi.js";

/**
 * Overlay that draws light gizmos (center marker, radius circle, label)
 * when Lights mode is active in the map editor.
 *
 * Redraws only when data changes via setLights/setSelectedLightId/setDragPreview — never per-frame.
 */
export class LightGizmoOverlay {
  constructor() {
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);

    /** @type {Array<object>} */
    this._lights = [];

    /** @type {Text[]} Cached label Text objects. */
    this._labels = [];

    /** @type {string|null} */
    this._selectedLightId = null;

    /** @type {{ lightId: string, x: number, y: number }|null} */
    this._dragPreview = null;
  }

  /**
   * Replaces the lights array and redraws.
   * @param {Array<object>} lights
   */
  setLights(lights) {
    this._lights = Array.isArray(lights) ? lights : [];
    this._rebuild();
  }

  /**
   * Sets the selected light id and redraws.
   * @param {string|null} id
   */
  setSelectedLightId(id) {
    const next = id ?? null;
    if (this._selectedLightId === next) return;
    this._selectedLightId = next;
    this._rebuild();
  }

  /**
   * Sets a transient drag preview position for a light and redraws.
   * @param {string} lightId
   * @param {number} x
   * @param {number} y
   */
  setDragPreview(lightId, x, y) {
    this._dragPreview = { lightId, x, y };
    this._rebuild();
  }

  /**
   * Clears the drag preview and redraws.
   */
  clearDragPreview() {
    if (this._dragPreview === null) return;
    this._dragPreview = null;
    this._rebuild();
  }

  /**
   * Full rebuild — clears graphics and recreates all gizmos.
   */
  _rebuild() {
    this.graphics.clear();
    this._destroyLabels();

    for (const light of this._lights) {
      this._drawLight(light);
    }
  }

  /**
   * Draws a single light gizmo: radius circle, center marker, label.
   * @param {object} light
   */
  _drawLight(light) {
    let x = light.x;
    let y = light.y;
    if (x == null || y == null) return;

    // Use drag preview position if this light is being dragged
    if (this._dragPreview?.lightId === light.id) {
      x = this._dragPreview.x;
      y = this._dragPreview.y;
    }

    const isSelected = this._selectedLightId != null && light.id === this._selectedLightId;
    const isDisabled = light.enabled === false;
    const radius = light.radius ?? 96;
    const lightColor = this._parseColor(light.color);

    // Base alpha — disabled lights are very dim
    const baseAlpha = isDisabled ? 0.2 : 1;

    // --- Radius circle outline ---
    if (radius > 0) {
      this.graphics.circle(x, y, radius);
      if (isSelected) {
        this.graphics.stroke({
          color: lightColor,
          alpha: 0.9 * baseAlpha,
          width: 2,
        });
      } else {
        this.graphics.stroke({
          color: lightColor,
          alpha: 0.5 * baseAlpha,
          width: 1,
          pixelLine: true,
        });
      }
    }

    // --- Selection ring (white outer circle) ---
    if (isSelected && radius > 0) {
      this.graphics.circle(x, y, radius + 2);
      this.graphics.stroke({
        color: 0xffffff,
        alpha: 0.7 * baseAlpha,
        width: 1,
        pixelLine: true,
      });
    }

    // --- Center marker (small filled circle) ---
    this.graphics.circle(x, y, 3);
    this.graphics.fill({
      color: isSelected ? 0xffffff : lightColor,
      alpha: 0.9 * baseAlpha,
    });

    // --- Center outline for visibility on dark backgrounds ---
    this.graphics.circle(x, y, 3);
    this.graphics.stroke({
      color: isSelected ? 0xffffff : 0x000000,
      alpha: 0.5 * baseAlpha,
      width: 1,
      pixelLine: true,
    });

    // --- Label ---
    const labelText = light.id ?? "";
    if (labelText) {
      const label = new Text({
        text: labelText,
        style: {
          fontSize: 11,
          fill: 0xffffff,
          fontFamily: "monospace",
          dropShadow: {
            color: 0x000000,
            alpha: 0.8,
            blur: 0,
            distance: 1,
          },
        },
        resolution: 2,
      });
      label.anchor.set(0.5, 1);
      label.x = x;
      label.y = y - 6;
      label.alpha = baseAlpha;
      this.container.addChild(label);
      this._labels.push(label);
    }
  }

  /**
   * Parses a hex color string to a numeric value.
   * @param {string} color
   * @returns {number}
   */
  _parseColor(color) {
    if (typeof color === "string" && color.startsWith("#")) {
      return parseInt(color.slice(1), 16);
    }
    return 0xffffff;
  }

  /** Removes all Text label objects from the container. */
  _destroyLabels() {
    for (const label of this._labels) {
      this.container.removeChild(label);
      label.destroy();
    }
    this._labels.length = 0;
  }

  /** Cleans up all resources. */
  destroy() {
    this._destroyLabels();
    this.graphics.destroy();
    this.container.destroy({ children: true });
  }
}
