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

export const settings = $state({
  dark: root.classList.contains('dark'),
  oled: root.classList.contains('oled'),
  accent: root.dataset.accent || 'indigo',
  scale: root.style.fontSize || '16px',
});

function save(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function setDark(on) {
  settings.dark = on;
  root.classList.toggle('dark', on);
  save('ss_cfg_dark', String(on));
  syncThemeColor();
}

export function setOled(on) {
  settings.oled = on;
  root.classList.toggle('oled', on);
  save('ss_cfg_oled', String(on));
  syncThemeColor();
}

export function setAccent(name) {
  settings.accent = name;
  root.dataset.accent = name;
  save('ss_active_accent', name);
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
