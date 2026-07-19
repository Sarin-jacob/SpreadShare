// src/js/store.js

class AppStore {
  constructor() {
    this.state = {
      userProfile: null, // { email: string, name: string }
      directory: [], // Array of { id, name }
      activeGroupId: null,
      activeGroupName: null,
      currentView: 'dashboard',
      groupEvents: [],
      syncStatus: 'synced', // 'synced' | 'syncing' | 'error'
      theme: {
        isDark: false,
        isOled: false,
        accent: 'indigo'
      }
    };
    this.listeners = new Set();
  }

  // Retrieve a frozen copy of the state to prevent direct mutation
  getState() {
    return Object.freeze({ ...this.state });
  }

  // Update specific keys in the state and notify all subscribers
  setState(updates) {
    this.state = { ...this.state, ...updates };
    this.notify();
  }

  // Reset workspace state (e.g., when switching groups or signing out)
  clearWorkspace() {
    this.setState({
      activeGroupId: null,
      activeGroupName: null,
      groupEvents: []
    });
  }

  // Components call this to re-render when data changes
  subscribe(listener) {
    this.listeners.add(listener);
    // Return a cleanup function so components can unsubscribe when destroyed
    return () => this.listeners.delete(listener); 
  }

  notify() {
    const currentState = this.getState();
    this.listeners.forEach(listener => listener(currentState));
  }
}

// Export a single, shared instance of the store
export const store = new AppStore();