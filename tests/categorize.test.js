import { describe, it, expect } from 'vitest';
import { tokenize, trainModel, predict, suggestCategory, keywordCategory, expenseText } from '../src/lib/categorize.js';

const history = [
  ['Instamart order', 'Groceries'],
  ['Instamart veggies', 'Groceries'],
  ['instamart', 'Groceries'],
  ['Swiggy Instamart', 'Groceries'],
  ['Dinner at Toit', 'Food'],
  ['Toit beers', 'Food'],
  ['Lunch', 'Food'],
  ['Cab to airport', 'Travel'],
  ['Goa flight', 'Travel'],
  ['Misc', 'General'],
].map(([text, category]) => ({ text, category }));
const model = trainModel(history);

describe('tokenize', () => {
  it('keeps words and word pairs, drops numbers and filler', () => {
    expect(tokenize('Dinner at the Toit 2x 450')).toEqual(['dinner', 'toit', 'dinner_toit']);
    expect(tokenize('Café')).toEqual(['cafe']);
  });
});

describe('history model', () => {
  it('ignores General / uncategorised rows', () => {
    expect(model.docs).toBe(9);
    expect(model.classes.General).toBeUndefined();
  });

  it('learns personal vocabulary the keyword rules do not know', () => {
    expect(keywordCategory('Toit')).toBeNull();
    expect(predict(model, 'Toit')[0].category).toBe('Food');
    expect(suggestCategory('Toit friday', model)).toMatchObject({ category: 'Food', source: 'history' });
  });

  it('overrides generic keywords when your history is confident', () => {
    // Keyword rules say "Swiggy" is Food; this person uses Swiggy Instamart for groceries.
    expect(keywordCategory('Swiggy Instamart')).toBe('Groceries');
    expect(keywordCategory('Swiggy')).toBe('Food');
    expect(suggestCategory('swiggy instamart', model)).toMatchObject({ category: 'Groceries', source: 'history' });
  });

  it('falls back to keywords for words it has never seen', () => {
    expect(suggestCategory('Movie tickets', model)).toMatchObject({ category: 'Entertainment', source: 'keywords' });
    expect(suggestCategory('Electricity bill', model)).toMatchObject({ category: 'Utilities', source: 'keywords' });
  });

  it('stays quiet when nothing matches', () => {
    expect(suggestCategory('zzqx', model)).toBeNull();
    expect(suggestCategory('', model)).toBeNull();
  });

  it('needs a few examples before trusting history', () => {
    const tiny = trainModel([{ text: 'Toit', category: 'Food' }]);
    expect(suggestCategory('Toit', tiny)).toBeNull();
    expect(suggestCategory('Dinner', tiny)).toMatchObject({ category: 'Food', source: 'keywords' });
  });
});

describe('keywordCategory', () => {
  it.each([
    ['Breakfast', 'Food'],
    ['Auto rickshaw', 'Travel'],
    ['Train tickets', 'Travel'],
    ['Flat rent', 'Stay'],
    ['Wifi recharge', 'Utilities'],
    ['Apollo Pharmacy', 'Health'],
    ['Myntra order', 'Shopping'],
  ])('%s → %s', (text, category) => {
    expect(keywordCategory(text)).toBe(category);
  });
});

describe('expenseText', () => {
  it('combines title, scanned merchant and item names', () => {
    const text = expenseText({ title: 'Bakery run', receipt_scan: { merchant: 'Moonlight Cake House', items: [{ name: 'x' }] }, receipt_items: [{ name: 'Honey Walnut' }] });
    expect(text).toBe('Bakery run Moonlight Cake House Honey Walnut');
  });
});
