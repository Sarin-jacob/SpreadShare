// Guards against features being unhooked by accident while editing a view: the pieces exist and
// tests cover them, but a screen stopped using them.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
/** The <input …> tag (attributes included) that contains `marker`. */
function inputWith(file, marker) {
  const s = src(file);
  const at = s.indexOf(marker);
  expect(at, `${marker} in ${file}`).toBeGreaterThan(-1);
  const start = s.lastIndexOf('<input', at);
  return s.slice(start, s.indexOf('/>', at) + 2);
}

describe('number pad is wired up', () => {
  it('is mounted once by the app', () => {
    expect(src('App.svelte').match(/<Numpad\s*\/>/g)).toHaveLength(1);
  });

  it.each([
    ['amount', 'bind:value={amountExpr}'],
    ['exchange rate', 'bind:value={rateExpr}'],
    ['who paid', 'bind:value={payerInputs[m]}'],
    ['split shares', 'bind:value={splitInputs[m]}'],
    ['item prices', 'bind:value={item.amount}'],
    ['interest', 'bind:value={interestExpr}'],
  ])('expense form: %s takes expressions', (_, marker) => {
    const tag = inputWith('views/ExpenseForm.svelte', marker);
    expect(tag).toMatch(/use:numpad(?!=)/);
  });

  it.each([
    ['components/BudgetsCard.svelte', 'placeholder="No limit"'],
    ['views/Group.svelte', 'bind:value={budgetInput}'],
    ['views/Import.svelte', 'bind:value={r.amount}'],
  ])('%s: plain-number field', (file, marker) => {
    expect(inputWith(file, marker)).toMatch(/use:numpad=\{\{\s*ops:\s*false\s*\}\}/);
  });
});

describe('a way back to the number pad', () => {
  it('expense form offers it (with brackets meanwhile) when the pad is off', () => {
    const s = src('views/ExpenseForm.svelte');
    expect(s).toMatch(/\{#if !padEnabled\(\)\}[\s\S]*?'\(', '\)'[\s\S]*?usePad\(\)/);
  });

  it('Settings shows whether it is on right now and turns it back on', () => {
    expect(src('views/Settings.svelte')).toMatch(/checked=\{padEnabled\(\)\}[^\n]*usePad\(\)/);
  });
});

describe('date and time pickers are wired up', () => {
  it('expense form opens the date and the time dialogs', () => {
    const s = src('views/ExpenseForm.svelte');
    expect(s).toMatch(/<DateDialog[\s\S]*?onpick=/);
    expect(s).toMatch(/<TimeDialog[\s\S]*?onpick=/);
    expect(s).not.toMatch(/type="datetime-local"/);
  });

  it('bulk import uses the date dialog', () => {
    const s = src('views/Import.svelte');
    expect(s).toMatch(/<DateDialog/);
    expect(s).not.toMatch(/type="date"/);
  });
});

describe('pop-up blocked help is wired up', () => {
  it('shows on the sign-in page and as a banner', () => {
    expect(src('views/Login.svelte')).toMatch(/popupHelp\(\)/);
    expect(src('App.svelte')).toMatch(/app\.sync\.popupBlocked[\s\S]*popupHelp\(\)/);
  });
});

describe('receipt scanner passes the picked file to the reader', () => {
  it('so screenshots get their date and app', () => {
    const s = src('components/ReceiptScanner.svelte');
    expect(s).toMatch(/scanReceipt\(flat,\s*R\.fileHints\(file\)\)/);
    expect(src('lib/receipt/index.js')).toMatch(/solveReceipt\(boxes,\s*hints\)/);
  });
});

describe('sharing the sarin-jacob.github.io origin with other apps', () => {
  const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

  it('the installed app has its own id (its path), not the origin root', () => {
    const s = file('build/brand-icons.js');
    expect(s).toMatch(/export const APP_ID = '\/SpreadShare\/';/);
    expect(s).toMatch(/id: APP_ID,/);
    expect(s).not.toMatch(/id: '\.\/'/);
  });

  it('the service worker only deletes its own old caches', () => {
    const s = file('public/sw.js');
    const activate = s.slice(s.indexOf("addEventListener('activate'"), s.indexOf("addEventListener('activate'") + 600);
    expect(activate).toMatch(/k\.startsWith\('spreadshare-'\)/);
  });

  it('reinstalling only touches this app’s service worker and caches', () => {
    const s = src('lib/updates.svelte.js');
    expect(s).not.toMatch(/getRegistrations\(\)\)\.forEach|of await navigator\.serviceWorker\.getRegistrations\(\)/);
    expect(s).toMatch(/r\.scope\.startsWith\(ownScope\(\)\)/);
    expect(s).toMatch(/ownCache\(name\) && !KEEP_CACHES\(name\)/);
  });

  it('never clears storage the other apps use too', () => {
    for (const f of ['lib/app.svelte.js', 'lib/updates.svelte.js', 'lib/db.js', 'lib/settings.svelte.js', 'lib/prefs.svelte.js']) {
      expect(src(f), f).not.toMatch(/localStorage\.clear\(|sessionStorage\.clear\(|deleteDatabase\(/);
    }
  });
});
