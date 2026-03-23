/**
 * Server-side entity registry with indexed lookups.
 * Stores runtime GameEntity instances and provides queries by
 * runtimeId, mapId, and authoredId (composite "mapId/authoredId").
 */
export class ServerEntityManager {
  constructor() {
    /** @type {Map<string, import('../game/entities/GameEntity.js').GameEntity>} runtimeId → entity */
    this._entities = new Map();
    /** @type {Map<string, Set<string>>} mapId → Set of runtimeIds */
    this._byMap = new Map();
    /** @type {Map<string, string>} "mapId/authoredId" → runtimeId */
    this._byAuthoredId = new Map();
    /** @type {number} */
    this._nextId = 1;
  }

  /**
   * Generates the next runtime entity id (e.g. "e1", "e2").
   * @returns {string}
   */
  nextId() {
    return `e${this._nextId++}`;
  }

  /**
   * Registers a GameEntity in all indexes.
   * @param {import('../game/entities/GameEntity.js').GameEntity} entity
   * @returns {import('../game/entities/GameEntity.js').GameEntity} The registered entity.
   */
  register(entity) {
    this._entities.set(entity.runtimeId, entity);

    // Map index
    let mapSet = this._byMap.get(entity.mapId);
    if (!mapSet) {
      mapSet = new Set();
      this._byMap.set(entity.mapId, mapSet);
    }
    mapSet.add(entity.runtimeId);

    // Authored id index (composite key)
    const authoredKey = `${entity.mapId}/${entity.authoredId}`;
    this._byAuthoredId.set(authoredKey, entity.runtimeId);

    return entity;
  }

  /**
   * Removes a single entity by runtimeId from all indexes.
   * @param {string} runtimeId
   * @returns {boolean} True if the entity was found and removed.
   */
  remove(runtimeId) {
    const entity = this._entities.get(runtimeId);
    if (!entity) return false;

    this._entities.delete(runtimeId);

    // Map index
    const mapSet = this._byMap.get(entity.mapId);
    if (mapSet) {
      mapSet.delete(runtimeId);
      if (mapSet.size === 0) this._byMap.delete(entity.mapId);
    }

    // Authored id index
    const authoredKey = `${entity.mapId}/${entity.authoredId}`;
    this._byAuthoredId.delete(authoredKey);

    return true;
  }

  /**
   * Removes all entities belonging to a map.
   * Used by despawnEntitiesForMap().
   * @param {string} mapId
   * @returns {number} Number of entities removed.
   */
  removeByMap(mapId) {
    const mapSet = this._byMap.get(mapId);
    if (!mapSet) return 0;

    let count = 0;
    for (const runtimeId of mapSet) {
      const entity = this._entities.get(runtimeId);
      if (entity) {
        const authoredKey = `${entity.mapId}/${entity.authoredId}`;
        this._byAuthoredId.delete(authoredKey);
        this._entities.delete(runtimeId);
        count++;
      }
    }

    this._byMap.delete(mapId);
    return count;
  }

  /**
   * Looks up an entity by runtimeId.
   * @param {string} runtimeId
   * @returns {import('../game/entities/GameEntity.js').GameEntity|undefined}
   */
  get(runtimeId) {
    return this._entities.get(runtimeId);
  }

  /**
   * Returns all entities belonging to a map.
   * @param {string} mapId
   * @returns {import('../game/entities/GameEntity.js').GameEntity[]}
   */
  getByMap(mapId) {
    const mapSet = this._byMap.get(mapId);
    if (!mapSet) return [];
    const result = [];
    for (const runtimeId of mapSet) {
      const entity = this._entities.get(runtimeId);
      if (entity) result.push(entity);
    }
    return result;
  }

  /**
   * Looks up an entity by its authored id within a specific map.
   * @param {string} mapId
   * @param {string} authoredId
   * @returns {import('../game/entities/GameEntity.js').GameEntity|undefined}
   */
  getByAuthoredId(mapId, authoredId) {
    const authoredKey = `${mapId}/${authoredId}`;
    const runtimeId = this._byAuthoredId.get(authoredKey);
    if (!runtimeId) return undefined;
    return this._entities.get(runtimeId);
  }

  /**
   * Returns an iterator over all registered entities.
   * @returns {IterableIterator<import('../game/entities/GameEntity.js').GameEntity>}
   */
  getAll() {
    return this._entities.values();
  }

  /**
   * Returns the total number of registered entities.
   * @returns {number}
   */
  count() {
    return this._entities.size;
  }
}
