// src/js/utils/toast.js
export const Toast = {
  show(message, type = 'success') {
    // Remove existing toast if present
    const existing = document.getElementById('ss-toast');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'ss-toast';
    el.className = `fixed bottom-24 left-1/2 transform -translate-x-1/2 px-5 py-2.5 rounded-full text-white text-xs font-bold shadow-xl z-[9999] transition-all duration-300 translate-y-10 opacity-0 flex items-center space-x-2`;
    
    // Theme based on type
    if (type === 'error') el.classList.add('bg-rose-600');
    else if (type === 'info') el.classList.add('bg-slate-800', 'dark:bg-slate-700');
    else el.classList.add('bg-emerald-600');

    el.innerHTML = `
      <span>${type === 'error' ? '🚨' : type === 'success' ? '✨' : 'ℹ️'}</span>
      <span>${message}</span>
    `;

    document.body.appendChild(el);

    // Animate in
    requestAnimationFrame(() => {
      el.classList.remove('translate-y-10', 'opacity-0');
    });

    // Animate out and remove
    setTimeout(() => {
      el.classList.add('translate-y-10', 'opacity-0');
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }
};