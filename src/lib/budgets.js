// src/lib/budgets.js
// Monthly category budgets on *your share* of spending. Pure maths; storage lives in
// prefs.svelte.js (local + a small file in your Drive so budgets follow you across devices).
import { processAnalytics } from './insights.js';
import { round2 } from './math.js';

/** Your share per category from the 1st of this month until now. */
export function monthToDate(events, email, now = new Date()) {
  return processAnalytics(events, email, now.getDate(), now);
}

/** Fraction of the month elapsed (for "on track" pacing). */
export function monthProgress(now = new Date()) {
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return (now.getDate() - 1 + now.getHours() / 24) / days;
}

/**
 * @param budgets { [category]: limit } (and optional '*' = overall)
 * @returns [{ category, limit, spent, left, ratio, status: 'ok'|'near'|'over' }]
 */
export function budgetStatus(budgets, data) {
  const rows = [];
  for (const [category, limit] of Object.entries(budgets || {})) {
    if (!(limit > 0)) continue;
    const spent = round2(category === '*' ? data.total : data.categories[category] || 0);
    const ratio = spent / limit;
    rows.push({ category, limit, spent, left: round2(limit - spent), ratio, status: ratio >= 1 ? 'over' : ratio >= 0.8 ? 'near' : 'ok' });
  }
  return rows.sort((a, b) => (a.category === '*' ? -1 : b.category === '*' ? 1 : b.ratio - a.ratio));
}

/** A heads-up after saving an expense, or null when it's comfortably within budget. */
export function budgetAlert(budgets, data, category) {
  const rows = budgetStatus(budgets, data).filter((r) => r.category === category || r.category === '*');
  const worst = rows.sort((a, b) => b.ratio - a.ratio)[0];
  return worst && worst.status !== 'ok' ? worst : null;
}
