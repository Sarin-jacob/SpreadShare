// src/lib/categorize.js
// On-device category suggestions for expenses. Two layers:
//   1. A small multinomial Naive Bayes model trained on the user's own past expenses
//      (title + scanned merchant + item names → category). Learns personal habits.
//   2. Keyword rules for common merchants and words, used when history is thin or unsure.
// Pure functions: no DOM, no storage, no network.

/** Ordered: the first matching rule wins, so more specific categories come first. */
export const CATEGORY_RULES = [
  // Grocery apps and supermarkets before Food: "Swiggy Instamart" sells groceries.
  ['Groceries', /instamart|blinkit|zepto|bigbasket|jiomart|dmart|supermarket|hypermarket/i],
  // Food before the other ambiguous ones: "fried rice", "chicken biryani" and "Uber Eats" are meals.
  ['Food', /restaurant|\bcaf[eé]\b|coffee|kitchen|dhaba|bakery|pizza|burger|biryani|swiggy|zomato|uber\s*eats|eatsure|\bbar\b|\bpub\b|brew|eatery|\bfoods?\b|starbucks|mcdonald|\bkfc\b|domino|subway|chai|\btea\b|\bdine|bistro|grill|canteen|\bmess\b|breakfast|brunch|lunch|dinner|snacks?|dessert|ice\s*cream|drinks|beers?|takeaway|take\s*out|meals?\b|bhava?n\b|bhawan|udupi|darshini|sagar\b|tiffin|thali|dosa|idli|idly|vada|paneer|naan|\broti\b|paratha|parotta|masala|tikka|curry|chicken|mutton|\bfish\b|prawns?|momos?|noodles|fried\s*rice|manchurian|samosa|chaat|pani\s*puri|lassi|juice|shake|mocktail|cocktail|whisky|vodka|\brum\b|\bwine\b|sandwich|pasta|fries|\bwrap\b|shawarma|kebab|sweets|mithai|cappuccino|latte|espresso|mojito|\bsoup\b|starter|haldiram|barbeque|bbq/i],
  ['Groceries', /grocer|supermarket|hypermarket|\bmart\b|blinkit|zepto|bigbasket|instamart|dmart|jiomart|reliance\s*(fresh|smart)|more\s*retail|spencer|nature'?s\s*basket|ratnadeep|kirana|provision|walmart|costco|aldi|lidl|tesco|sainsbury|whole\s*foods|trader\s*joe|fairprice|giant|\bvegetables?\b|\bveggies\b|\bfruits?\b|\bmilk\b|\beggs?\b|\bration\b|\batta\b|\bdal\b|\bflour\b|\bsugar\b|\bghee\b|\bcurd\b|\bdahi\b|\bbread\b|biscuits?|detergent|\bsoap\b|shampoo|toothpaste|tissue|amul|britannia|aashirvaad|tata\s*salt|surf\s*excel|onions?|tomato(es)?|potato(es)?/i],
  ['Health', /pharma|chemist|medical|medicine|hospital|clinic|apollo|medplus|1mg|netmeds|pharmeasy|practo|\bdrug|diagnostic|\blab\b|dental|doctor|\bgym\b|cult\.?\s*fit|physio|tablets?\b|syrup|capsules?|optical|spectacles|lenskart/i],
  ['Travel', /\buber\b|\bola\b|rapido|namma\s*yatri|blablacar|zoomcar|yulu|\bfuel\b|petrol|diesel|\bhpcl\b|\bbpcl\b|indian\s*oil|\bshell\b|fastag|parking|\btoll\b|\bmetro\b|railway|irctc|redbus|abhibus|airline|airways|indigo|vistara|air\s*india|spicejet|akasa|\bcab\b|taxi|\bauto\b|rickshaw|\bbus\b|train|flight|airport|\bferry\b|scooter|bike\s*rental|car\s*rental|boarding/i],
  ['Stay', /\bhotel\b|resort|\binn\b|hostel|zostel|lodge|\boyo\b|treebo|fabhotel|airbnb|agoda|booking\.com|homestay|\brent\b|\bpg\b|room\s*(charges?|tariff|rent)|\btariff\b|maintenance|deposit|check-?in/i],
  ['Utilities', /electric|electricity|\bpower\b|bescom|tneb|msedcl|tata\s*power|adani\s*electricity|water\s*(board|bill|can|tax)|broadband|fibernet|hathway|wi-?fi|internet|recharge|postpaid|prepaid|airtel|\bjio\b|vodafone|bsnl|\bdth\b|tata\s*play|\bgas\b|\blpg\b|\bigl\b|\bmgl\b|cylinder|\bbill\s*pay|\bmaid\b|cook\s*salary|cleaning|laundry|dry\s*clean|society/i],
  ['Entertainment', /cinema|\bpvr\b|\binox\b|movie|theatre|theater|bookmyshow|district|insider|netflix|spotify|prime\s*video|hotstar|jiocinema|sonyliv|zee5|youtube\s*premium|apple\s*tv|gaming|playstation|\bsteam\b|bowling|amusement|wonderla|concert|tickets?|museum|\bclub\b|party|parasail|trek|safari|adventure|\bzoo\b/i],
  ['Shopping', /fashion|apparel|clothing|clothes|shoes|footwear|electronics|amazon|flipkart|myntra|ajio|meesho|nykaa|tata\s*cliq|croma|reliance\s*digital|vijay\s*sales|decathlon|ikea|pepperfry|\bmall\b|lifestyle|pantaloons|westside|max\s*fashion|uniqlo|zara|h\s*&\s*m|gift|souvenir|books?\b|stationery|hardware|furniture|headphones|charger|t-?shirt|jeans|kurta|saree/i],
];

export function keywordCategory(text) {
  if (!text) return null;
  for (const [value, re] of CATEGORY_RULES) if (re.test(text)) return value;
  return null;
}

const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Keyword category from the parts of an expense rather than one blob of text. What the user
 * typed counts most (3), then the shop name (2, nothing extra when the title is the shop name),
 * and the items share 4 votes in proportion to their amounts. So "Hotel Saravana Bhavan" with
 * dosa and coffee on the bill is Food, while a hotel bill with room charges stays Stay.
 * @param parts { title?, merchant?, items?: [{ name, total?|amount? }] }
 */
export function keywordVotes({ title, merchant, items = [] } = {}) {
  const votes = new Map();
  const add = (c, w) => c && w > 0 && votes.set(c, (votes.get(c) || 0) + w);
  add(keywordCategory(title), 3);
  if (merchant && squash(merchant) !== squash(title)) add(keywordCategory(merchant), 2);
  const matched = items
    .map((i) => ({ c: keywordCategory(i?.name), w: Math.abs(Number(i?.total ?? i?.amount)) || 1 }))
    .filter((i) => i.c);
  const weight = matched.reduce((s, i) => s + i.w, 0);
  for (const i of matched) add(i.c, (4 * i.w) / weight);
  let best = null;
  for (const [value] of CATEGORY_RULES) if (votes.has(value) && (!best || votes.get(value) > votes.get(best) + 1e-9)) best = value;
  return best;
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

/**
 * Category for an expense from its parts (title, scanned shop, items); see suggestCategory and
 * keywordVotes. `parts` is payload-shaped: { title, receipt_scan, receipt_items }.
 */
export function suggestCategoryFor(parts, model = null) {
  const text = expenseText(parts);
  if (!text.trim()) return null;
  const ranked = model && model.docs >= MIN_DOCS ? predict(model, text) : [];
  const top = ranked[0];
  if (top && top.p >= MIN_P && top.evidence >= 2) return { category: top.category, source: 'history', confidence: top.p };
  const items = parts?.receipt_items?.length ? parts.receipt_items : parts?.receipt_scan?.items || [];
  const kw = keywordVotes({ title: parts?.title, merchant: parts?.receipt_scan?.merchant, items });
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
