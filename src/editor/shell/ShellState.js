export class ShellState {
  constructor() {
    this.state = {
      activeWorkspaceId: null,
      workspaceIds: [],
    };

    this.listeners = new Set();
  }

  get() {
    return this.state;
  }

  patch(partial) {
    Object.assign(this.state, partial);
    this.emit();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of [...this.listeners]) {
      listener(this.state);
    }
  }
}
