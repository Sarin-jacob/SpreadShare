// Vendored from receipt_test@8125280 — bench/lib/audit.js. Keep in sync with that repo; avoid local edits.
// Engine-agnostic arithmetic checks on a normalized result. These need no
// ground truth, so the same checks can gate results in the real app.
const close = (a, b, tol = 0.02) => a != null && b != null && Math.abs(a - b) <= tol;
const sum = arr => Math.round(arr.reduce((s, x) => s + (x ?? 0), 0) * 100) / 100;

export function audit(r) {
  const checks = [];
  const itemSum = sum(r.items.map(i => i.total));

  if (r.items.length && r.subtotal != null) {
    checks.push({ name: 'items = subtotal', ok: close(itemSum, r.subtotal), detail: `${itemSum} vs ${r.subtotal}` });
  }

  for (const it of r.items) {
    if (it.qty != null && it.unit_price != null && it.total != null && it.qty !== 1) {
      const ok = close(it.qty * it.unit_price + (it.discount ?? 0), it.total, Math.max(0.02, Math.abs(it.total) * 0.01));
      if (!ok) checks.push({ name: `qty×price "${it.name}"`, ok, detail: `${it.qty}×${it.unit_price} vs ${it.total}` });
    }
  }

  const base = r.subtotal ?? (r.items.length ? itemSum : null);
  if (base != null && r.total != null) {
    const addTax = sum(r.taxes.filter(t => !t.inclusive).map(t => t.amount));
    const expected = sum([base, sum(r.discounts.map(d => d.amount)), sum(r.charges.map(c => c.amount)), addTax]);
    // Line-level discounts are often already inside the subtotal; accept either reading.
    const alt = sum([base, sum(r.charges.map(c => c.amount)), addTax]);
    checks.push({ name: 'totals reconcile', ok: close(expected, r.total) || close(alt, r.total), detail: `expected ${expected} (or ${alt}) vs total ${r.total}` });
  }

  for (const c of r.charges) {
    if (/round/i.test(c.label ?? '') && Math.abs(c.amount) >= 1) checks.push({ name: 'rounding < 1', ok: false, detail: `${c.label} ${c.amount}` });
  }

  if (r.total == null) checks.push({ name: 'has total', ok: false, detail: 'no total' });

  return { ok: checks.length > 0 && checks.every(c => c.ok), checks };
}
