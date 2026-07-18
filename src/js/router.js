// src/js/router.js
import { store } from './store.js';

class ApplicationRouter {
  constructor() {
    this.currentRoute = null;
    // Map of valid routes to prevent users navigating to non-existent hashes
    this.validRoutes = ['dashboard', 'group-detail', 'add-expense', 'expense-detail', 'settings'];
  }

  init() {
    // 1. Listen for browser Back/Forward navigation
    window.addEventListener('hashchange', () => this.handleHashChange());
    
    // 2. Intercept local navigation button clicks
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-route]');
      if (trigger) {
        e.preventDefault();
        const route = trigger.getAttribute('data-route');
        this.navigate(route);
      }
    });

    // 3. Trigger initial route calculation on app launch
    this.handleHashChange();
  }

  /**
   * Programmatic navigation. Updates the URL hash, which inherently 
   * triggers handleHashChange() to process the UI switch.
   */
  navigate(route) {
    if (this.validRoutes.includes(route)) {
      window.location.hash = route;
    }
  }

  handleHashChange() {
    // Extract route from URL, default to dashboard
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    const targetRoute = this.validRoutes.includes(hash) ? hash : 'dashboard';
    
    if (this.currentRoute === targetRoute) return;
    this.currentRoute = targetRoute;

    // Repaint the UI
    this.updateDOM(targetRoute);
    
    // Notify the central store so active components can wake up / fetch data
    store.setState({ currentView: targetRoute });
  }

  updateDOM(targetRoute) {
    // Hide all view sections
    document.querySelectorAll('section[id^="view-"]').forEach(section => {
      section.classList.add('hidden');
    });
    
    // Reveal the target view
    const activeView = document.getElementById(`view-${targetRoute}`);
    if (activeView) {
      activeView.classList.remove('hidden');
    }

    // Update navigation tab visual highlights (Desktop Sidebar & Mobile Bottom Nav)
    document.querySelectorAll('[data-route]').forEach(btn => {
      if (btn.getAttribute('data-route') === targetRoute) {
        btn.classList.add('text-accent-600', 'dark:text-accent-400', 'font-bold');
        btn.classList.remove('text-slate-400', 'dark:text-slate-500');
      } else {
        btn.classList.remove('text-accent-600', 'dark:text-accent-400', 'font-bold');
        btn.classList.add('text-slate-400', 'dark:text-slate-500');
      }
    });
  }
}

// Export a single singleton instance
export const AppRouter = new ApplicationRouter();