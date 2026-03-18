export class TileCollision {
  static collidesWithLayer(map, layerName, x, y, hitbox) {
    const ts = map.tileSize;
    const left = x + hitbox.offsetX;
    const top = y + hitbox.offsetY;
    const right = left + hitbox.width - 1;
    const bottom = top + hitbox.height - 1;

    const tileLeft = Math.floor(left / ts);
    const tileRight = Math.floor(right / ts);
    const tileTop = Math.floor(top / ts);
    const tileBottom = Math.floor(bottom / ts);

    for (let ty = tileTop; ty <= tileBottom; ty++) {
      for (let tx = tileLeft; tx <= tileRight; tx++) {
        if (map.getTile(layerName, tx, ty) >= 0) return true;
      }
    }
    return false;
  }
}
