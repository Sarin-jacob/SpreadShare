// @vitest-environment jsdom
// The on-screen number pad: typing with it, staying open across taps, and handing over to the
// system keyboard on devices with a mouse or a physical keyboard.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { evaluate } from '../src/lib/math.js';

/** matchMedia for a phone (touch first; `stylus` also has a fine pointer, like an S Pen) or a laptop. */
function device({ touch, stylus = false }) {
  window.matchMedia = (q) => ({
    matches: q.includes('any-pointer: fine') ? !touch || stylus : q.includes('pointer: coarse') ? touch : q.includes('pointer: fine') ? !touch : false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  });
}

/** In-memory Web Storage (Node's own localStorage global gets in jsdom's way). */
function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

async function load({ touch = true, stylus = false } = {}) {
  device({ touch, stylus });
  vi.resetModules();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  return import('../src/lib/numpad.svelte.js');
}

function field(numpad, opts) {
  const el = document.createElement('input');
  el.setAttribute('inputmode', 'decimal');
  document.body.append(el);
  const action = numpad(el, opts);
  return { el, action };
}

const type = (press, keys) => [...keys].forEach((k) => press(k));

beforeEach(() => {
  document.body.innerHTML = '';
  // (bind:clientHeight on the pad; jsdom has no layout)
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('number pad on a phone', () => {
  it('opens on focus and hides the phone keyboard', async () => {
    const { numpad, pad } = await load();
    const { el } = field(numpad);
    expect(el.inputMode).toBe('none'); // set before focus, so the keyboard never starts opening
    el.focus();
    expect(pad.target).toBe(el);
    expect(pad.ops).toBe(true);
  });

  it('types an expression with brackets and operators', async () => {
    const { numpad, press } = await load();
    const { el } = field(numpad);
    const seen = [];
    el.addEventListener('input', () => seen.push(el.value)); // what bind:value listens to
    el.focus();
    type(press, '(450+120)/3');
    expect(el.value).toBe('(450+120)/3');
    expect(seen.at(-1)).toBe('(450+120)/3');
    expect(evaluate(el.value)).toBe(190);
  });

  it('inserts and deletes at the caret', async () => {
    const { numpad, press } = await load();
    const { el } = field(numpad);
    el.focus();
    type(press, '1200');
    el.setSelectionRange(1, 1);
    press('+');
    expect(el.value).toBe('1+200');
    press('back');
    press('back');
    expect(el.value).toBe('200');
    el.setSelectionRange(0, 3);
    press('5');
    expect(el.value).toBe('5'); // replaces a selection
  });

  it('stays open when tapping a key takes focus away (touchscreens)', async () => {
    const { numpad, press, pad } = await load();
    const { el } = field(numpad);
    el.focus();
    press('7');
    el.blur(); // what a tap does on a real phone, even with pointerdown cancelled
    vi.runAllTimers();
    expect(pad.target).toBe(el);
    expect(document.activeElement).toBe(el);
    press('5');
    expect(el.value).toBe('75');
  });

  it('closes when you tap into another field after a key', async () => {
    const { numpad, press, pad } = await load();
    const { el } = field(numpad);
    const title = document.createElement('input');
    document.body.append(title);
    el.focus();
    press('7');
    title.focus();
    vi.runAllTimers();
    expect(document.activeElement).toBe(title);
    expect(pad.target).toBe(null);
  });

  it('moves between pad fields', async () => {
    const { numpad, pad } = await load();
    const a = field(numpad).el;
    const b = field(numpad, { ops: false }).el;
    a.focus();
    b.focus();
    vi.runAllTimers();
    expect(pad.target).toBe(b);
    expect(pad.ops).toBe(false);
  });

  it('Done closes it', async () => {
    const { numpad, press, pad } = await load();
    const { el } = field(numpad);
    el.focus();
    press('4');
    press('done');
    vi.runAllTimers();
    expect(pad.target).toBe(null);
    expect(document.activeElement).not.toBe(el);
  });

  it('hands over to the system keyboard when a physical key is pressed', async () => {
    const { numpad, pad, padEnabled } = await load();
    const { el } = field(numpad);
    el.focus();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '5', bubbles: true }));
    expect(pad.target).toBe(null);
    expect(padEnabled()).toBe(false);
    expect(el.inputMode).toBe('decimal');
    expect(sessionStorage.getItem('ss_numpad_hw')).toBe('1');
  });

  it('ignores the phone keyboard’s own key events', async () => {
    const { numpad, pad } = await load();
    const { el } = field(numpad);
    el.focus();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', bubbles: true }));
    expect(pad.target).toBe(el);
  });

  it('the keyboard key switches to the system keyboard, and Settings switches back', async () => {
    const { numpad, press, pad, setSystemKeyboard } = await load();
    const { el } = field(numpad);
    el.focus();
    press('keyboard');
    expect(pad.system).toBe(true);
    expect(el.inputMode).toBe('decimal');
    expect(localStorage.getItem('ss_numpad_system')).toBe('1');
    setSystemKeyboard(false);
    expect(el.inputMode).toBe('none');
  });

  it('leaves read-only fields alone', async () => {
    const { numpad, pad } = await load();
    const { el } = field(numpad);
    el.readOnly = true;
    el.focus();
    expect(pad.target).toBe(null);
  });
});

describe('number pad on a phone with a stylus', () => {
  it('still opens (a stylus is a fine pointer, but touch is the main one)', async () => {
    const { numpad, pad } = await load({ stylus: true });
    const { el } = field(numpad);
    el.focus();
    expect(pad.target).toBe(el);
  });
});

describe('number pad on a laptop / desktop', () => {
  it('never opens; fields keep the system keyboard', async () => {
    const { numpad, pad } = await load({ touch: false });
    const { el } = field(numpad);
    expect(el.inputMode).toBe('decimal');
    el.focus();
    expect(pad.target).toBe(null);
  });
});

describe('Numpad component', () => {
  it('shows bracket and operator keys for amounts and types with them', async () => {
    const { numpad } = await load();
    const { default: Numpad } = await import('../src/components/Numpad.svelte');
    const { mount, unmount, flushSync } = await import('svelte'); // the same copy as the component's
    const app = mount(Numpad, { target: document.body });
    const { el } = field(numpad);
    el.focus();
    flushSync();
    const keys = (label) => document.querySelector(`[data-numpad] button[aria-label="${label}"]`);
    for (const label of ['Open bracket', 'Close bracket', 'Plus', 'Minus', 'Times', 'Divide', 'Delete', 'Done']) expect(keys(label), label).toBeTruthy();
    for (const k of ['Open bracket', '2', 'Plus', '3', 'Close bracket', 'Times', '4']) keys(k).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    expect(el.value).toBe('(2+3)*4');
    expect(evaluate(el.value)).toBe(20);
    unmount(app);
  });

  it('a tap on the pad doesn’t take focus (touchstart / mousedown are cancelled)', async () => {
    const { numpad } = await load();
    const { default: Numpad } = await import('../src/components/Numpad.svelte');
    const { mount, unmount, flushSync } = await import('svelte'); // the same copy as the component's
    const app = mount(Numpad, { target: document.body });
    const { el } = field(numpad);
    el.focus();
    flushSync();
    const root = document.querySelector('[data-numpad]');
    const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    root.querySelector('button').dispatchEvent(md);
    expect(md.defaultPrevented).toBe(true);
    const ts = new Event('touchstart', { bubbles: true, cancelable: true });
    root.querySelector('button').dispatchEvent(ts);
    expect(ts.defaultPrevented).toBe(true);
    unmount(app);
  });

  it('plain-number fields get digits only', async () => {
    const { numpad } = await load();
    const { default: Numpad } = await import('../src/components/Numpad.svelte');
    const { mount, unmount, flushSync } = await import('svelte'); // the same copy as the component's
    const app = mount(Numpad, { target: document.body });
    field(numpad, { ops: false }).el.focus();
    flushSync();
    expect(document.querySelector('[aria-label="Open bracket"]')).toBe(null);
    expect(document.querySelector('[aria-label="Plus"]')).toBe(null);
    expect(document.querySelector('[data-numpad] button[aria-label="Done"]')).toBeTruthy();
    unmount(app);
  });
});
