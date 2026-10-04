// Vendored from receipt_test@b9dd94a , bench/lib/audit.js. Keep in sync with that repo; avoid local edits.
// Engine-agnostic arithmetic checks on a normalized result. These need no
// ground truth, so the same checks can gate results in the real app.
const close = (a, b, tol = 0.02) => a != null && b != null && Math.abs(a - b) <= tol;
const sum = arr => Math.round(arr.reduce((s, x) => s + (x ?? 0), 0) * 100) / 100;
// Bills often round the payable amount to a whole unit without printing a round-off line
// (749.42 → 749). A whole-number total within one unit of the arithmetic counts as agreeing.
const agrees = (expected, total) => close(expected, total) || (Number.isInteger(total) && Math.abs(expected - total) < 1);
const GST_RATES = [0.05, 0.12, 0.18, 0.28, 0.03, 0.025, 0.09, 0.06];

export function audit(r) {
  const checks = [];
  const itemSum = sum(r.items.map(i => i.total));
  const taxSum = sum(r.taxes.map(t => t.amount));
  const chargeSum = sum(r.charges.map(c => c.amount));
  const discSum = sum(r.discounts.map(d => d.amount));

  if (r.items.length && r.subtotal != null) {
    // Items add up to the subtotal , or, when each line amount already includes tax, to the
    // subtotal plus tax / to the total.
    const ok = close(itemSum, r.subtotal) || agrees(sum([r.subtotal, taxSum]), itemSum) || (r.total != null && agrees(itemSum, r.total))
      || (r.total != null && close(sum([itemSum, chargeSum]), r.total));
    checks.push({ name: 'items = subtotal', ok, detail: `${itemSum} vs ${r.subtotal}` });
  }

  for (const it of r.items) {
    if (it.qty != null && it.unit_price != null && it.total != null && it.qty !== 1) {
      const qp = it.qty * it.unit_price + (it.discount ?? 0);
      const tol = Math.max(0.02, Math.abs(it.total) * 0.01);
      // Tax-inclusive line amounts: qty × price × (1 + GST rate).
      const ok = close(qp, it.total, tol) || GST_RATES.some(g => close(qp * (1 + g), it.total, tol));
      if (!ok) checks.push({ name: `qty×price "${it.name}"`, ok, detail: `${it.qty}×${it.unit_price} vs ${it.total}` });
    }
  }

  const base = r.subtotal ?? (r.items.length ? itemSum : null);
  if (base != null && r.total != null) {
    const addTax = sum(r.taxes.filter(t => !t.inclusive).map(t => t.amount));
    const expected = sum([base, discSum, chargeSum, addTax]);
    // Line-level discounts are often already inside the subtotal; accept either reading.
    const alt = sum([base, chargeSum, addTax]);
    // Items that already include tax: total = items (+ charges).
    const incl = r.items.length ? sum([itemSum, chargeSum, discSum]) : null;
    checks.push({ name: 'totals reconcile', ok: agrees(expected, r.total) || agrees(alt, r.total) || (incl != null && agrees(incl, r.total)), detail: `expected ${expected} (or ${alt}) vs total ${r.total}` });
  }

  for (const c of r.charges) {
    if (/round/i.test(c.label ?? '') && Math.abs(c.amount) >= 1) checks.push({ name: 'rounding < 1', ok: false, detail: `${c.label} ${c.amount}` });
  }

  // Printed item / quantity counts ("Tot Items: 11", "8/19") against what was read.
  const counts = r.details?.counts;
  if (counts?.printed_items != null && r.items.length) {
    checks.push({ name: 'item count', ok: counts.printed_items === counts.items, detail: `printed ${counts.printed_items}, read ${counts.items}` });
  }
  if (counts?.printed_qty != null && r.items.length) {
    checks.push({ name: 'qty count', ok: Math.abs(counts.printed_qty - counts.qty) < 0.01, detail: `printed ${counts.printed_qty}, read ${counts.qty}` });
  }

  if (r.total == null) checks.push({ name: 'has total', ok: false, detail: 'no total' });

  return { ok: checks.length > 0 && checks.every(c => c.ok), checks };
}
