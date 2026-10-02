// src/lib/router.svelte.js
// Minimal hash router: #/path/segments?query=string
import { tick } from 'svelte';

function parse() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return {
    path,
    segments: path.split('/').filter(Boolean).map(decodeURIComponent),
    query: Object.fromEntries(new URLSearchParams(qs)),
  };
}

export const route = $state(parse());

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** Updates the route, cross-fading between screens where the browser supports View Transitions. */
function applyRoute(scrollTop = false) {
  const update = async () => {
    Object.assign(route, parse());
    if (scrollTop) window.scrollTo(0, 0);
    await tick();
  };
  if (document.startViewTransition && !reduceMotion.matches && document.visibilityState === 'visible') {
    document.startViewTransition(update);
  } else {
    update();
  }
}

window.addEventListener('hashchange', () => applyRoute(true));

export function go(path, query) {
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  location.hash = `#${path}${qs}`;
}

/** Replace the current entry (no extra back-button step). */
export function replace(path) {
  history.replaceState(null, '', `${location.pathname}${location.search}#${path}`);
  applyRoute(true);
}
