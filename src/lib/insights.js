// src/lib/insights.js
import { parsePayload, eventIdOf, deletedIds } from './engine.js';
import { round2 } from './math.js';

const localKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Spend analytics over EXPENSE_ADD events.
 * @param targetEmail when set, counts only that member's allocated share; otherwise full amounts.
 * @param days window size; 0 means all time (trend is then empty).
 */
export function processAnalytics(events, targetEmail = null, days = 30) {
  const data = {
    total: 0,
    count: 0,
    categories: {},
    dayOfWeek: { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 },
    trend: [], // [{ date, value }] oldest → newest
  };

  const now = new Date();
  const start = days > 0 ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)) : new Date(0);
  const buckets = new Map();
  if (days > 0) {
    for (let i = 0; i < days; i++) {
      buckets.set(localKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)), 0);
    }
  }

  const deleted = deletedIds(events);
  const seen = new Set();

  for (const event of events) {
    const id = eventIdOf(event);
    if (event.event_type !== 'EXPENSE_ADD' || seen.has(id) || deleted.has(id)) continue;
    seen.add(id);

    let payload;
    try {
      payload = parsePayload(event);
    } catch {
      continue;
    }
    const date = new Date(payload.custom_timestamp || event.timestamp);
    if (date < start) continue;

    let value;
    if (targetEmail) {
      const alloc = (payload.allocations || []).find((a) => a.user === targetEmail);
      value = alloc ? parseFloat(alloc.value) || 0 : 0;
    } else {
      value = parseFloat(payload.evaluated_amount) || 0;
    }
    if (value <= 0) continue;
    value = round2(value);

    data.total = round2(data.total + value);
    data.count++;
    const cat = payload.category || 'General';
    data.categories[cat] = round2((data.categories[cat] || 0) + value);
    const dow = date.toLocaleDateString('en-US', { weekday: 'short' });
    data.dayOfWeek[dow] = round2((data.dayOfWeek[dow] || 0) + value);
    const key = localKey(date);
    if (buckets.has(key)) buckets.set(key, round2(buckets.get(key) + value));
  }

  data.trend = [...buckets].map(([date, value]) => ({ date, value }));
  return data;
}
