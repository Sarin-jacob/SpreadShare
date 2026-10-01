// src/lib/router.svelte.js
// Minimal hash router: #/path/segments?query=string

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

window.addEventListener('hashchange', () => {
  Object.assign(route, parse());
  window.scrollTo(0, 0);
});

export function go(path, query) {
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  location.hash = `#${path}${qs}`;
}

/** Replace the current entry (no extra back-button step). */
export function replace(path) {
  history.replaceState(null, '', `${location.pathname}${location.search}#${path}`);
  Object.assign(route, parse());
}
