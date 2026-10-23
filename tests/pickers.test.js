// @vitest-environment jsdom
// Date and time dialogs: what a tap / key press picks.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import DateDialog from '../src/components/DateDialog.svelte';
import TimeDialog from '../src/components/TimeDialog.svelte';

beforeEach(() => {
  document.body.innerHTML = '';
  Element.prototype.setPointerCapture ??= () => {};
});

function open(Component, value) {
  const onpick = vi.fn();
  const onclose = vi.fn();
  const app = mount(Component, { target: document.body, props: { value, onpick, onclose } });
  flushSync();
  return { app, onpick, onclose };
}
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text || b.getAttribute('aria-label') === text);
const click = (el) => {
  el.click();
  flushSync();
};

describe('date dialog', () => {
  it('one tap on a day picks it and closes', () => {
    const { app, onpick, onclose } = open(DateDialog, '2026-10-22');
    click(button('15'));
    expect(onpick).toHaveBeenCalledWith('2026-10-15');
    expect(onclose).toHaveBeenCalled();
    unmount(app);
  });

  it('pages to the next month and back', () => {
    const { app, onpick } = open(DateDialog, '2026-12-05');
    click(button('Next month'));
    expect(document.body.textContent).toMatch(/January 2027/);
    click(button('3'));
    expect(onpick).toHaveBeenCalledWith('2027-01-03');
    unmount(app);
  });

  it('jumps to a month from the month grid', () => {
    const { app, onpick } = open(DateDialog, '2026-10-22');
    click(button('October 2026'));
    click(button('Previous year'));
    click(button('Mar'));
    expect(document.body.textContent).toMatch(/March 2025/);
    click(button('1'));
    expect(onpick).toHaveBeenCalledWith('2025-03-01');
    unmount(app);
  });

  it('Cancel picks nothing', () => {
    const { app, onpick, onclose } = open(DateDialog, '2026-10-22');
    click(button('Cancel'));
    expect(onpick).not.toHaveBeenCalled();
    expect(onclose).toHaveBeenCalled();
    unmount(app);
  });
});

describe('time dialog', () => {
  const dial = () => document.querySelector('[role=slider]');
  /** A tap on the dial at viewBox coordinates (the dial is drawn 256 × 256). */
  function tap(x, y) {
    const el = dial();
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 256, height: 256, right: 256, bottom: 256 });
    el.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, pointerId: 1, bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, pointerId: 1, bubbles: true }));
    flushSync();
  }

  it('tap the hour, then the minute, then OK', () => {
    const { app, onpick, onclose } = open(TimeDialog, '19:05');
    tap(128 - 102 * Math.sin(Math.PI / 3), 128 - 102 * Math.cos(Math.PI / 3)); // "10" on the dial
    expect(dial().getAttribute('aria-label')).toBe('Minute'); // moved on by itself
    tap(230, 128); // "15"
    click(button('OK'));
    expect(onpick).toHaveBeenCalledWith(hour12() ? '22:15' : '10:15');
    expect(onclose).toHaveBeenCalled();
    unmount(app);
  });

  it('arrow keys move the hand; Enter goes from hours to minutes to OK', () => {
    const { app, onpick } = open(TimeDialog, '09:58');
    const key = (k) => {
      dial().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      flushSync();
    };
    key('ArrowUp');
    key('Enter');
    key('ArrowUp');
    key('ArrowUp');
    key('ArrowUp'); // wraps past 59
    key('Enter');
    expect(onpick).toHaveBeenCalledWith('10:01');
    unmount(app);
  });

  it('switches AM / PM in 12-hour locales', () => {
    if (!hour12()) return;
    const { app, onpick } = open(TimeDialog, '07:30');
    click(document.querySelectorAll('[aria-pressed]')[3]); // PM (after hour, minute, AM)
    click(button('OK'));
    expect(onpick).toHaveBeenCalledWith('19:30');
    unmount(app);
  });

  it('Cancel picks nothing', () => {
    const { app, onpick } = open(TimeDialog, '07:30');
    click(button('Cancel'));
    expect(onpick).not.toHaveBeenCalled();
    unmount(app);
  });
});

function hour12() {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ?? false;
}
