// src/lib/tags.js
// #tags written in a title or note ("Dinner #goa #office"). Case-insensitive, stored as typed.

// Letters, digits and combining marks (so Hindi / Tamil words aren't cut off), plus _ and -.
const TAG_RE = /(^|[\s(,])#([\p{L}\p{N}][\p{L}\p{M}\p{N}_-]{0,30})/gu;

/** Lower-cased unique tags in the text, in order of appearance. */
export function extractTags(...texts) {
  const out = [];
  for (const t of texts) {
    for (const m of String(t || '').matchAll(TAG_RE)) {
      const tag = m[2].toLowerCase();
      if (!out.includes(tag)) out.push(tag);
    }
  }
  return out;
}

/** "Dinner #goa #office" → { text: 'Dinner', tags: ['goa', 'office'] } (for display). */
export function splitTags(title) {
  const tags = extractTags(title);
  const text = String(title || '').replace(TAG_RE, '$1').replace(/\s{2,}/g, ' ').trim();
  return { text: text || String(title || '').trim(), tags };
}

/** Tags of an expense payload (title + note). */
export const tagsOf = (payload) => extractTags(payload?.title, payload?.notes);

/** Most used tags across expenses: [{ tag, count }]. */
export function tagCounts(expenses) {
  const counts = new Map();
  for (const x of expenses) for (const t of tagsOf(x.payload)) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
