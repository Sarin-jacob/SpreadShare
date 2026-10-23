// src/lib/numpad.svelte.js
// On-screen number pad for amount fields on touch screens. Phone keyboards' number layouts have
// no + − × ÷ ( ), so amounts like "(450+120)/3" couldn't be typed. Fields opt in with use:numpad;
// where a mouse / trackpad is the main pointer, or once a physical key is pressed in one, the field
// keeps the system keyboard.

const SYSTEM_KEY = 'ss_numpad_system'; // '1': you chose the system keyboard (⌨ on the pad)
const coarse = matchMedia('(pointer: coarse)');

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
  // Touch is the main input (phones, tablets). Not "no fine pointer at all": phones with a stylus
  // report one.
  touch: coarse.matches,
  /** A physical key was pressed in a pad field this session (Bluetooth / tablet keyboard). */
  hardware: read('ss_numpad_hw', sessionStorage) === '1',
  /** Settings: always the system keyboard on this device. */
  system: read(SYSTEM_KEY) === '1',
  /** The field where ⌨ was tapped: it uses the phone keyboard until you leave it. */
  skip: null,
});

/** Every field with use:numpad. */
const fields = new Set();
/** Pad fields hide the phone keyboard (inputmode none) only while the pad is in use. */
const applyMode = (el) => (el.inputMode = padEnabled() && pad.skip !== el ? 'none' : el.dataset.inputmode || 'decimal');

const update = () => {
  pad.touch = coarse.matches;
  fields.forEach(applyMode);
};
coarse.addEventListener('change', update);

/** True when pad fields should use the on-screen pad instead of the system keyboard. */
export const padEnabled = () => pad.touch && !pad.hardware && !pad.system;

/** System keyboard instead of the pad on this device (Settings). */
export function setSystemKeyboard(on) {
  pad.system = on;
  save(SYSTEM_KEY, on ? '1' : null);
  if (!on) forgetHardware();
  close();
}

/** Back to the pad after it was switched off (a physical keyboard was detected, or Settings). */
export function usePad() {
  forgetHardware();
  setSystemKeyboard(false);
}

function forgetHardware() {
  pad.hardware = false;
  save('ss_numpad_hw', null, sessionStorage);
}

function close() {
  pad.target = null;
  fields.forEach(applyMode);
}

// When a pad key was last pressed. On a touchscreen a tap moves focus even when the key's
// pointerdown is cancelled, so the field's blur right after a key press is undone (see numpad()).
let pressedAt = 0;
const KEY_BLUR_MS = 600;

/** Types into the focused field like a keyboard would (at the caret), so bind:value and oninput run. */
export function press(key) {
  const el = pad.target;
  if (!el) return;
  if (key === 'done') {
    pressedAt = 0; // a real blur
    return el.blur();
  }
  if (key === 'keyboard') {
    // The phone keyboard for this field only: the pad is back in the next one.
    pressedAt = 0;
    pad.skip = el;
    close();
    el.blur();
    requestAnimationFrame(() => el.focus());
    return;
  }
  pressedAt = Date.now();
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
 * Svelte action for the pad itself: touches and clicks on it never take focus from the field
 * (cancelling touchstart also stops the tap from focusing the key on phones).
 */
export function holdFocus(node) {
  node.dataset.numpad = '';
  const keep = (e) => {
    pressedAt = Date.now();
    if (e.cancelable) e.preventDefault();
  };
  node.addEventListener('touchstart', keep, { passive: false });
  node.addEventListener('mousedown', keep);
  return {
    destroy() {
      node.removeEventListener('touchstart', keep);
      node.removeEventListener('mousedown', keep);
    },
  };
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

  let refocusing = false;
  const onFocus = () => {
    applyMode(node);
    if (!padEnabled() || pad.skip === node || node.readOnly || node.disabled) return;
    const opening = pad.target !== node;
    pad.target = node;
    pad.ops = ops;
    // Out from under the pad once it has slid in.
    if (opening && !refocusing) setTimeout(() => node.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 120);
    refocusing = false;
  };
  const onBlur = () => {
    if (pad.skip === node && document.activeElement !== node) {
      // Left the field ⌨ was tapped in (not the blur ⌨ itself does to reopen the keyboard).
      setTimeout(() => {
        if (document.activeElement === node) return;
        pad.skip = null;
        applyMode(node);
      }, 50);
    }
    if (pad.target !== node) return;
    // Focus taken by a tap on the pad: give it back, keep the pad open.
    if (Date.now() - pressedAt < KEY_BLUR_MS) {
      refocusing = true;
      setTimeout(() => {
        const now = document.activeElement;
        if (pad.target !== node || now === node) return;
        // (Unless you tapped into another field or button meanwhile.)
        if (now && now !== document.body && !now.closest('[data-numpad]')) return close();
        node.focus({ preventScroll: true });
      });
      return;
    }
    close();
  };
  const onKey = (e) => {
    // A key from a physical keyboard. Phone keyboards can still send keys here (one left open from
    // the previous field), some with real key values; they leave `code` empty, physical ones don't.
    if (pad.target !== node || e.isComposing || e.key === 'Unidentified' || e.key === 'Process') return;
    if (!e.code || e.code === 'Unidentified') return;
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
