// src/js/utils/toast.js
export const Toast = {
  show(message, type = 'success') {
    // Remove existing toast if present
    const existing = document.getElementById('ss-toast');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'ss-toast';
    
    el.className = `fixed z-[9999] transition-all duration-300 opacity-0 flex items-center space-x-2.5 text-white text-xs font-bold shadow-xl
                    left-1/2 -translate-x-1/2 
                    bottom-24 px-5 py-2.5 rounded-full translate-y-10 
                    md:bottom-auto md:top-6 md:w-max md:px-6 md:py-3.5 md:rounded-2xl md:-translate-y-10 md:text-sm`;
    
    let iconSvg = '';

    // Theme & Icon based on type
    if (type === 'error') {
      el.classList.add('bg-rose-600');
      iconSvg = `<svg class="w-4 h-4 md:w-5 md:h-5 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
    } else if (type === 'info') {
      el.classList.add('bg-slate-800', 'dark:bg-slate-700');
      iconSvg = `<svg class="w-4 h-4 md:w-5 md:h-5 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
    } else {
      el.classList.add('bg-emerald-600');
      iconSvg = `<svg class="w-4 h-4 md:w-5 md:h-5 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
    }

    el.innerHTML = `
      ${iconSvg}
      <span class="tracking-wide">${message}</span>
    `;

    document.body.appendChild(el);

    // Animate in: Remove positional offsets and set opacity to 100
    requestAnimationFrame(() => {
      el.classList.remove('opacity-0', 'translate-y-10', 'md:-translate-y-10');
      el.classList.add('opacity-100', 'translate-y-0');
    });

    // Animate out and remove
    setTimeout(() => {
      el.classList.remove('opacity-100', 'translate-y-0');
      el.classList.add('opacity-0', 'translate-y-10', 'md:-translate-y-10');
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }
};