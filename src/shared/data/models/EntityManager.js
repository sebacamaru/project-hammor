export class EntityManager {
  constructor() {
    this.entities = new Map();
  }

  add(entity) {
    this.entities.set(entity.id, entity);
    return entity;
  }

  remove(id) {
    this.entities.delete(id);
  }

  get(id) {
    return this.entities.get(id);
  }

  getAll() {
    return this.entities.values();
  }

  updateAll(dt, input) {
    for (const entity of this.entities.values()) {
      entity.update(dt, input);
    }
  }
}
