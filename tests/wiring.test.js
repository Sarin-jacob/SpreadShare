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
