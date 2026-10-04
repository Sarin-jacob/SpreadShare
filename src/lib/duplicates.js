// src/lib/duplicates.js
// "Someone already added this bill": same amount around the same time, or the same shop's
// receipt. Pure; the form shows the matches as a warning and never blocks saving.

const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const DAY = 86_400_000;

/**
 * @param expenses ledger expenses (computeLedgerState().expenses)
 * @param draft { amount, when: Date|string, title?, merchant? }
 * @param opts.excludeId the entry being edited
 * @returns up to 3 expenses, most likely first
 */
export function findDuplicates(expenses, draft, { excludeId = null } = {}) {
  const amount = Number(draft?.amount);
  if (!(amount > 0)) return [];
  const when = new Date(draft.when).getTime();
  if (Number.isNaN(when)) return [];
  const title = squash(draft.title);
  const merchant = squash(draft.merchant);

  const scored = [];
  for (const x of expenses) {
    if (x.type !== 'EXPENSE_ADD' || x.eventId === excludeId) continue;
    // Rounding, a tip or a converted currency can move the amount a little.
    if (Math.abs(x.amount - amount) > Math.max(0.01, amount * 0.005)) continue;
    const days = Math.abs(new Date(x.timestamp).getTime() - when) / DAY;
    const sameShop = merchant && squash(x.payload?.receipt_scan?.merchant) === merchant;
    const sameTitle = title && squash(x.title) === title;
    // Same amount within a day and a half, or the same shop / title within a week.
    if (days > (sameShop || sameTitle ? 7 : 1.5)) continue;
    scored.push({ x, score: (sameShop ? 3 : 0) + (sameTitle ? 2 : 0) - days });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 3).map((s) => s.x);
}
