import { describe, it, expect } from 'vitest';
import { distribute, exactWithRemainder, computeSplit } from '../src/lib/split.js';

const sum = (o) => Math.round(Object.values(o).reduce((s, v) => s + v, 0) * 100) / 100;
const ABC = ['a', 'b', 'c'];

describe('distribute', () => {
  it('splits 100 three ways to the exact cent', () => {
    const r = distribute(100, { a: 1, b: 1, c: 1 });
    expect(sum(r)).toBe(100);
    expect(Object.values(r).sort()).toEqual([33.33, 33.33, 33.34]);
  });

  it('respects weights', () => {
    expect(distribute(90, { a: 2, b: 1 })).toEqual({ a: 60, b: 30 });
  });

  it('drops zero weights and returns null when nothing is weighted', () => {
    expect(distribute(10, { a: 1, b: 0 })).toEqual({ a: 10 });
    expect(distribute(10, { a: 0 })).toBeNull();
  });
});

describe('exactWithRemainder', () => {
  it('gives the single blank field the remainder', () => {
    const r = exactWithRemainder(1234.5, { a: '400', b: '600/2' }, ABC);
    expect(r).toEqual({ vals: { a: 400, b: 300, c: 534.5 }, auto: 'c' });
  });

  it('reports what is left to assign', () => {
    const r = exactWithRemainder(100, { a: '10', b: '10' }, ABC.slice(0, 2));
    expect(r.error).toMatch(/left to assign/);
  });

  it('reports overspend', () => {
    expect(exactWithRemainder(100, { a: '80', b: '40' }, ['a', 'b']).error).toMatch(/Over by/);
  });

  it('flags invalid expressions', () => {
    expect(exactWithRemainder(100, { a: 'x' }, ['a']).error).toMatch(/Check the amount/);
  });
});

describe('computeSplit', () => {
  it('EQUALLY excludes unticked members', () => {
    const r = computeSplit('EQUALLY', 1234.5, ABC, { excluded: { c: true } });
    expect(r.alloc).toEqual({ a: 617.25, b: 617.25 });
  });

  it('EQUALLY needs at least one person', () => {
    expect(computeSplit('EQUALLY', 10, ['a'], { excluded: { a: true } }).error).toBeTruthy();
  });

  it('SHARES treats blanks as 1 and 0 as excluded', () => {
    const r = computeSplit('SHARES', 100, ABC, { inputs: { a: '2', c: '0' } });
    expect(r.alloc).toEqual({ a: 66.67, b: 33.33 });
  });

  it('ADJUSTMENT shares the remainder equally', () => {
    // 300 total, a pays 30 extra → base (300-30)/3 = 90
    const r = computeSplit('ADJUSTMENT', 300, ABC, { inputs: { a: '+30' } });
    expect(r.alloc).toEqual({ a: 120, b: 90, c: 90 });
    expect(sum(r.alloc)).toBe(300);
  });

  it('ADJUSTMENT rejects negative shares', () => {
    expect(computeSplit('ADJUSTMENT', 10, ['a', 'b'], { inputs: { a: '-50' } }).error).toBeTruthy();
  });
});
