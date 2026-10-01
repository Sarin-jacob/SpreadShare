// src/lib/categories.js
// `value` is what gets stored in the sheet; keep existing values stable for old data.
export const CATEGORIES = [
  { value: 'Food', label: 'Food & Dining', icon: '🍽️', color: '#f59e0b' },
  { value: 'Groceries', label: 'Groceries', icon: '🛒', color: '#10b981' },
  { value: 'Travel', label: 'Transport', icon: '🚕', color: '#3b82f6' },
  { value: 'Stay', label: 'Stay & Rent', icon: '🏠', color: '#8b5cf6' },
  { value: 'Utilities', label: 'Bills & Utilities', icon: '💡', color: '#84cc16' },
  { value: 'Entertainment', label: 'Entertainment', icon: '🎬', color: '#ec4899' },
  { value: 'Shopping', label: 'Shopping', icon: '🛍️', color: '#f43f5e' },
  { value: 'Health', label: 'Health', icon: '💊', color: '#14b8a6' },
  { value: 'General', label: 'General', icon: '📦', color: '#64748b' },
];

const byValue = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));
const fallback = ['#6366f1', '#22c55e', '#a855f7', '#06b6d4', '#f97316'];

export function category(value) {
  if (byValue[value]) return byValue[value];
  if (value === 'Financial') return { value, label: 'Payment', icon: '💸', color: '#22c55e' };
  let h = 0;
  for (const ch of String(value)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { value, label: value, icon: '🏷️', color: fallback[h % fallback.length] };
}
