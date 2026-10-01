// src/lib/settings.svelte.js
// Appearance preferences. Keys match the original app so saved preferences carry over;
// index.html applies them before first paint.

export const ACCENTS = {
  indigo: '#6366f1', blue: '#3b82f6', cyan: '#06b6d4', teal: '#14b8a6',
  emerald: '#10b981', amber: '#f59e0b', orange: '#f97316', rose: '#f43f5e',
  pink: '#ec4899', fuchsia: '#d946ef', violet: '#8b5cf6', slate: '#64748b',
};

export const SCALES = [
  { value: '14px', label: 'S' },
  { value: '16px', label: 'M' },
  { value: '18px', label: 'L' },
  { value: '20px', label: 'XL' },
];

const root = document.documentElement;
const systemDark = matchMedia('(prefers-color-scheme: dark)');

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key, value) {
  try {
    value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
  } catch {}
}

const savedDark = read('ss_cfg_dark');

export const settings = $state({
  /** 'light' | 'dark' | 'system' */
  theme: savedDark === 'true' ? 'dark' : savedDark === 'false' ? 'light' : 'system',
  dark: root.classList.contains('dark'),
  oled: root.classList.contains('oled'),
  accent: root.dataset.accent || 'indigo',
  scale: root.style.fontSize || '16px',
});

function applyDark() {
  settings.dark = settings.theme === 'system' ? systemDark.matches : settings.theme === 'dark';
  root.classList.toggle('dark', settings.dark);
  syncThemeColor();
}

systemDark.addEventListener('change', () => {
  if (settings.theme === 'system') applyDark();
});

export function setTheme(mode) {
  settings.theme = mode;
  save('ss_cfg_dark', mode === 'system' ? null : String(mode === 'dark'));
  applyDark();
}

export function setOled(on) {
  settings.oled = on;
  root.classList.toggle('oled', on);
  save('ss_cfg_oled', String(on));
  syncThemeColor();
}

export function setAccent(name) {
  if (!ACCENTS[name]) return;
  settings.accent = name;
  root.dataset.accent = name;
  save('ss_active_accent', name);
  applyBrandLinks(name);
}

export function setScale(value) {
  settings.scale = value;
  root.style.fontSize = value;
  save('ss_ui_scale', value);
}

export function syncThemeColor() {
  const color = settings.dark ? (settings.oled ? '#000000' : '#0f172a') : '#f8fafc';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}

/**
 * Points favicon, apple-touch-icon and manifest at the icon set for this accent
 * (generated at build time by build/brand-icons.js). Browsers pick the favicon up immediately;
 * the manifest is read when the app is installed or when the browser checks for updates.
 */
export function applyBrandLinks(accent = settings.accent) {
  const base = accent === 'indigo' ? 'manifest.webmanifest' : `manifest-${accent}.webmanifest`;
  const set = (id, href) => {
    const el = document.getElementById(id);
    if (el && el.getAttribute('href') !== href) el.setAttribute('href', href);
  };
  set('ss-manifest', `./${base}`);
  set('ss-icon-svg', `./icons/${accent}.svg`);
  set('ss-icon-png', `./icons/${accent}-192.png`);
  set('ss-icon-apple', `./icons/${accent}-180.png`);
}
