// src/js/router.js
import { store } from './store.js';

class ApplicationRouter {
  constructor() {
    this.currentRoute = null;
    // Added 'insights' to the valid routes array
    this.validRoutes = ['dashboard', 'group-detail', 'add-expense', 'expense-detail', 'settings', 'insights'];
  }

  init() {
    window.addEventListener('hashchange', () => this.handleHashChange());
    
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-route]');
      if (trigger) {
        e.preventDefault();
        const route = trigger.getAttribute('data-route');
        this.navigate(route);
      }
    });

    this.handleHashChange();
  }

  navigate(route) {
    if (this.validRoutes.includes(route)) {
      window.location.hash = route;
    }
  }

  handleHashChange() {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    const targetRoute = this.validRoutes.includes(hash) ? hash : 'dashboard';
    
    if (this.currentRoute === targetRoute) return;
    this.currentRoute = targetRoute;

    this.updateDOM(targetRoute);
    store.setState({ currentView: targetRoute });
  }

  updateDOM(targetRoute) {
    document.querySelectorAll('section[id^="view-"]').forEach(section => {
      section.classList.add('hidden');
    });
    
    const activeView = document.getElementById(`view-${targetRoute}`);
    if (activeView) {
      activeView.classList.remove('hidden');
    }

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

export const AppRouter = new ApplicationRouter();