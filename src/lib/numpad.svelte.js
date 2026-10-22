// src/lib/numpad.svelte.js
// On-screen number pad for amount fields on touch screens. Phone keyboards' number layouts have
// no + − × ÷ ( ), so amounts like "(450+120)/3" couldn't be typed. Fields opt in with use:numpad;
// on a device with a mouse / trackpad (and so, a keyboard), or once a physical key is pressed in
// one, the field keeps the system keyboard.

const SYSTEM_KEY = 'ss_numpad_system'; // '1': you chose the system keyboard (⌨ on the pad)
const coarse = matchMedia('(pointer: coarse)');
const fine = matchMedia('(any-pointer: fine)');

function read(key, store = localStorage) {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}
function save(key, value, store = localStorage) {
  try {
    value == null ? store.removeItem(key) : store.setItem(key, value);
  } catch {}
}

export const pad = $state({
  /** Input the pad types into, while one is focused. */
  target: null,
  /** Whether the focused field takes + − × ÷ ( ) (amount expressions) or only a plain number. */
  ops: true,
  touch: coarse.matches && !fine.matches,
  /** A physical key was pressed in a pad field this session (Bluetooth / tablet keyboard). */
  hardware: read('ss_numpad_hw', sessionStorage) === '1',
  system: read(SYSTEM_KEY) === '1',
});

/** Every field with use:numpad. */
const fields = new Set();
/** Pad fields hide the phone keyboard (inputmode none) only while the pad is in use. */
const applyMode = (el) => (el.inputMode = padEnabled() ? 'none' : el.dataset.inputmode || 'decimal');

const update = () => {
  pad.touch = coarse.matches && !fine.matches;
  fields.forEach(applyMode);
};
coarse.addEventListener('change', update);
fine.addEventListener('change', update);

/** True when pad fields should use the on-screen pad instead of the system keyboard. */
export const padEnabled = () => pad.touch && !pad.hardware && !pad.system;

/** System keyboard instead of the pad on this device (⌨ on the pad; Settings turns it back). */
export function setSystemKeyboard(on) {
  pad.system = on;
  save(SYSTEM_KEY, on ? '1' : null);
  close();
}

function close() {
  pad.target = null;
  fields.forEach(applyMode);
}

/** Types into the focused field like a keyboard would (at the caret), so bind:value and oninput run. */
export function press(key) {
  const el = pad.target;
  if (!el) return;
  if (key === 'done') return el.blur();
  if (key === 'keyboard') {
    setSystemKeyboard(true);
    el.blur();
    requestAnimationFrame(() => el.focus());
    return;
  }
  const v = el.value;
  let start = el.selectionStart ?? v.length, end = el.selectionEnd ?? v.length;
  let next;
  if (key === 'back') {
    if (start === end && start > 0) start--;
    next = v.slice(0, start) + v.slice(end);
  } else {
    next = v.slice(0, start) + key + v.slice(end);
    start += key.length;
  }
  // The native setter, so frameworks see a real edit.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  try {
    el.setSelectionRange(start, start);
  } catch {}
}

/**
 * Svelte action: `<input use:numpad>` for amount expressions, `use:numpad={{ ops: false }}` for a
 * plain number. The field keeps its own inputmode for when the system keyboard is used.
 */
export function numpad(node, opts = {}) {
  let ops = opts.ops !== false;
  node.dataset.inputmode = node.getAttribute('inputmode') || 'decimal';
  fields.add(node);
  applyMode(node); // before focus, or the phone keyboard starts opening

  const onFocus = () => {
    applyMode(node);
    if (!padEnabled() || node.readOnly || node.disabled) return;
    pad.target = node;
    pad.ops = ops;
    // Out from under the pad once it has slid in.
    setTimeout(() => node.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
  };
  const onBlur = () => {
    if (pad.target === node) close();
  };
  const onKey = (e) => {
    // The phone keyboard is hidden (inputmode none), so a key here came from a physical keyboard.
    if (pad.target !== node || e.isComposing || e.key === 'Unidentified' || e.key === 'Process') return;
    if (e.key.length !== 1 && !['Backspace', 'Delete', 'Enter', 'Tab'].includes(e.key)) return;
    pad.hardware = true;
    save('ss_numpad_hw', '1', sessionStorage);
    close();
  };
  node.addEventListener('focus', onFocus);
  node.addEventListener('blur', onBlur);
  node.addEventListener('keydown', onKey);
  // Already focused (autofocus) before the action ran.
  if (document.activeElement === node) onFocus();
  return {
    update(o = {}) {
      ops = o.ops !== false;
      if (pad.target === node) pad.ops = ops;
    },
    destroy() {
      fields.delete(node);
      node.removeEventListener('focus', onFocus);
      node.removeEventListener('blur', onBlur);
      node.removeEventListener('keydown', onKey);
      if (pad.target === node) close();
    },
  };
}
