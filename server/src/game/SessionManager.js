/**
 * Manages game sessions. Each session links a connectionId to a playerId.
 * Provides fast lookup by sessionId and by connectionId via dual Maps.
 */
export class SessionManager {
  constructor() {
    /** @type {Map<string, object>} sessionId → session object */
    this.sessions = new Map();
    /** @type {Map<string, string>} connectionId → sessionId (reverse index) */
    this.connectionIndex = new Map();
    this.nextId = 1;
  }

  /**
   * Creates a new session linking a connection to a player.
   * @param {string} connectionId - The ClientConnection id.
   * @param {string} playerId - The ServerPlayer id.
   * @returns {object} The created session { id, connectionId, playerId, createdAt }.
   */
  create(connectionId, playerId) {
    const id = `s${this.nextId++}`;
    const session = {
      id,
      connectionId,
      playerId,
      createdAt: Date.now(),
    };

    this.sessions.set(id, session);
    this.connectionIndex.set(connectionId, id);

    return session;
  }

  /**
   * Finds a session by its associated connection id.
   * @param {string} connectionId
   * @returns {object|undefined} The session, or undefined if not found.
   */
  getByConnection(connectionId) {
    const sessionId = this.connectionIndex.get(connectionId);
    if (!sessionId) return undefined;
    return this.sessions.get(sessionId);
  }

  /**
   * Finds a session by its id.
   * @param {string} sessionId
   * @returns {object|undefined} The session, or undefined if not found.
   */
  getById(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Returns an iterator over all active sessions.
   * @returns {IterableIterator<object>}
   */
  getAll() {
    return this.sessions.values();
  }

  /**
   * Removes a session by id. Cleans up both maps.
   * @param {string} sessionId
   * @returns {object|null} The removed session, or null if not found.
   */
  remove(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    this.sessions.delete(sessionId);
    this.connectionIndex.delete(session.connectionId);

    return session;
  }
}
