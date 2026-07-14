// src/js/router.js

const views = {
  'dashboard': document.getElementById('view-dashboard'),
  'group-detail': document.getElementById('view-group-detail'),
  'add-expense': document.getElementById('view-add-expense'),
  'settings': document.getElementById('view-settings')
};

/**
 * Single Page Application Router
 * Switches active visible containers and repaints navigation button highlights
 * @param {string} targetViewKey 
 */
export function navigateToView(targetViewKey) {
  if (!views[targetViewKey]) return;
  
  // Hide all sections, reveal the target view
  Object.keys(views).forEach(key => views[key].classList.add('hidden'));
  views[targetViewKey].classList.remove('hidden');
  
  // Manage navigation active states across desktop sidebars and mobile bottom tabs
  document.querySelectorAll('[data-route]').forEach(btn => {
    if (btn.getAttribute('data-route') === targetViewKey) {
      btn.classList.add('text-accent-600', 'dark:text-accent-400', 'font-bold');
      btn.classList.remove('text-slate-400', 'dark:text-slate-500');
    } else {
      btn.classList.remove('text-accent-600', 'dark:text-accent-400', 'font-bold');
      btn.classList.add('text-slate-400', 'dark:text-slate-500');
    }
  });
}

export function initRouter() {
  document.querySelectorAll('[data-route]').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      const route = e.currentTarget.getAttribute('data-route');
      navigateToView(route);
    });
  });
}