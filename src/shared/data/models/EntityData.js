/**
 * Serializable entity snapshot for network messages and persistence.
 */
export class EntityData {
  constructor(id, type, x, y, direction = 0, speed = 0) {
    this.id = id;
    this.type = type;
    this.x = x;
    this.y = y;
    this.direction = direction;
    this.speed = speed;
  }

  static fromEntity(entity) {
    return new EntityData(
      entity.id,
      entity.type,
      entity.x,
      entity.y,
      entity.direction,
      entity.speed,
    );
  }

  static toPlain(entityData) {
    return {
      id: entityData.id,
      type: entityData.type,
      x: entityData.x,
      y: entityData.y,
      direction: entityData.direction,
      speed: entityData.speed,
    };
  }

  static fromPlain(obj) {
    return new EntityData(obj.id, obj.type, obj.x, obj.y, obj.direction, obj.speed);
  }
}
