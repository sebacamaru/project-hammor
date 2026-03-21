export class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.connectionIndex = new Map();
    this.nextId = 1;
  }

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

  getByConnection(connectionId) {
    const sessionId = this.connectionIndex.get(connectionId);
    if (!sessionId) return undefined;
    return this.sessions.get(sessionId);
  }

  getById(sessionId) {
    return this.sessions.get(sessionId);
  }

  remove(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    this.sessions.delete(sessionId);
    this.connectionIndex.delete(session.connectionId);

    return session;
  }
}
