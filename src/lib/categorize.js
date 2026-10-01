// src/lib/categorize.js
// On-device category suggestions for expenses. Two layers:
//   1. A small multinomial Naive Bayes model trained on the user's own past expenses
//      (title + scanned merchant + item names → category). Learns personal habits.
//   2. Keyword rules for common merchants and words, used when history is thin or unsure.
// Pure functions: no DOM, no storage, no network.

/** Ordered: the first matching rule wins, so more specific categories come first. */
export const CATEGORY_RULES = [
  ['Groceries', /grocer|supermarket|hypermarket|\bmart\b|blinkit|zepto|bigbasket|instamart|dmart|reliance\s*(fresh|smart)|more\s*retail|kirana|provision|walmart|costco|aldi|lidl|tesco|sainsbury|whole\s*foods|trader\s*joe|fairprice|giant|\bvegetables?\b|\bveggies\b|\bfruits?\b|\bmilk\b|\beggs?\b|\bration\b/i],
  ['Food', /restaurant|\bcaf[eé]\b|coffee|kitchen|dhaba|bakery|pizza|burger|biryani|swiggy|zomato|\bbar\b|\bpub\b|eatery|\bfoods?\b|starbucks|mcdonald|\bkfc\b|domino|subway|chai|\btea\b|\bdine|bistro|grill|canteen|\bmess\b|breakfast|brunch|lunch|dinner|snacks?|dessert|ice\s*cream|drinks|beers?|takeaway|take\s*out|meal/i],
  ['Health', /pharma|chemist|medical|medicine|hospital|clinic|apollo|medplus|1mg|netmeds|\bdrug|diagnostic|\blab\b|dental|doctor|\bgym\b|physio/i],
  ['Travel', /\buber\b|\bola\b|rapido|\bfuel\b|petrol|diesel|\bhpcl\b|\bbpcl\b|indian\s*oil|\bshell\b|parking|\btoll\b|\bmetro\b|railway|irctc|airline|airways|\bcab\b|taxi|\bauto\b|rickshaw|\bbus\b|train|flight|airport|\bferry\b|scooter|bike\s*rental|car\s*rental/i],
  ['Stay', /\bhotel\b|resort|\binn\b|hostel|lodge|\boyo\b|airbnb|homestay|\brent\b|\bpg\b|maintenance|deposit/i],
  ['Utilities', /electric|electricity|\bpower\b|water\s*(board|bill|can)|broadband|wi-?fi|internet|recharge|airtel|\bjio\b|vodafone|bsnl|\bgas\b|\blpg\b|cylinder|\bbill\s*pay|\bmaid\b|cleaning|laundry/i],
  ['Entertainment', /cinema|\bpvr\b|\binox\b|movie|theatre|theater|bookmyshow|netflix|spotify|prime\s*video|hotstar|gaming|bowling|amusement|concert|tickets?|museum|\bclub\b|party|parasail|trek|safari|adventure/i],
  ['Shopping', /fashion|apparel|clothing|clothes|shoes|footwear|electronics|amazon|flipkart|myntra|ajio|meesho|decathlon|ikea|\bmall\b|lifestyle|pantaloons|zara|h\s*&\s*m|gift|souvenir/i],
];

export function keywordCategory(text) {
  if (!text) return null;
  for (const [value, re] of CATEGORY_RULES) if (re.test(text)) return value;
  return null;
}

const STOPWORDS = new Set(
  'a an and the for of at in on to from with by my our your his her their is was paid pay bill total amount rs inr usd item items order no qty x'.split(' ')
);

/** Lower-cased word tokens plus adjacent pairs ("ice cream"), numbers and filler dropped. */
export function tokenize(text) {
  const words = String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  const out = [...words];
  for (let i = 1; i < words.length; i++) out.push(`${words[i - 1]}_${words[i]}`);
  return out;
}

/**
 * Trains the history model.
 * @param examples [{ text, category }]
 */
export function trainModel(examples) {
  const model = { docs: 0, classes: {}, vocab: new Set() };
  for (const { text, category } of examples) {
    if (!category || category === 'General' || category === 'Financial') continue; // no signal in the fallback bucket
    const tokens = tokenize(text);
    if (!tokens.length) continue;
    const c = (model.classes[category] ??= { docs: 0, tokens: 0, counts: new Map() });
    c.docs++;
    model.docs++;
    for (const t of new Set(tokens)) {
      c.counts.set(t, (c.counts.get(t) || 0) + 1);
      c.tokens++;
      model.vocab.add(t);
    }
  }
  return model;
}

/** Probability per category for `text`, best first. Empty when the model knows none of the words. */
export function predict(model, text) {
  const tokens = [...new Set(tokenize(text))].filter((t) => model.vocab.has(t));
  const classes = Object.entries(model.classes);
  if (!tokens.length || classes.length === 0) return [];
  const V = model.vocab.size;
  const scores = classes.map(([category, c]) => {
    let lp = Math.log(c.docs / model.docs);
    for (const t of tokens) lp += Math.log(((c.counts.get(t) || 0) + 1) / (c.tokens + V));
    return { category, lp, evidence: tokens.reduce((n, t) => n + (c.counts.get(t) || 0), 0) };
  });
  const max = Math.max(...scores.map((s) => s.lp));
  const z = scores.reduce((s, x) => s + Math.exp(x.lp - max), 0);
  return scores
    .map(({ category, lp, evidence }) => ({ category, p: Math.exp(lp - max) / z, evidence }))
    .sort((a, b) => b.p - a.p);
}

const MIN_DOCS = 5; // history needs a few labelled expenses before it's trusted
const MIN_P = 0.6;

/**
 * Suggests a category for an expense description.
 * Your history wins when it's confident (it knows your habits); otherwise keyword rules;
 * otherwise a weaker history guess that's still backed by a word you've used before.
 * @returns {{ category: string, source: 'history' | 'keywords', confidence: number } | null}
 */
export function suggestCategory(text, model = null) {
  if (!String(text || '').trim()) return null;
  const ranked = model && model.docs >= MIN_DOCS ? predict(model, text) : [];
  const top = ranked[0];
  if (top && top.p >= MIN_P && top.evidence >= 2) return { category: top.category, source: 'history', confidence: top.p };
  const kw = keywordCategory(text);
  if (kw) return { category: kw, source: 'keywords', confidence: 0.5 };
  if (top && top.p >= MIN_P && top.evidence >= 1) return { category: top.category, source: 'history', confidence: top.p };
  return null;
}

/** Text the model learns from / predicts on for an expense payload. */
export function expenseText(payload) {
  const scan = payload?.receipt_scan;
  return [
    payload?.title,
    scan?.merchant,
    ...(payload?.receipt_items || scan?.items || []).map((i) => i.name),
  ]
    .filter(Boolean)
    .join(' ');
}
