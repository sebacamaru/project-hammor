export class WorkspaceRegistry {
  constructor() {
    this.factories = new Map();
  }

  register(id, factory) {
    this.factories.set(id, factory);
  }

  create(id) {
    const factory = this.factories.get(id);
    if (!factory) {
      throw new Error(`Unknown workspace: "${id}"`);
    }
    return factory();
  }

  has(id) {
    return this.factories.has(id);
  }

  ids() {
    return [...this.factories.keys()];
  }
}
