import { describe, it, expect } from 'vitest';
import { evaluate, evaluateLoose, round2 } from '../src/lib/math.js';

describe('evaluate', () => {
  it.each([
    ['120', 120],
    ['120+45.5', 165.5],
    ['300/3', 100],
    ['2*(49-10)', 78],
    ['-5+10', 5],
    [' 1 + 2 * 3 ', 7],
    ['10×2÷4', 5],
  ])('%s = %d', (input, expected) => {
    expect(evaluate(input)).toBe(expected);
  });

  it.each(['', '5+', 'abc', '2**3', '1/0', '(1+2', 'alert(1)', '1..2'])('rejects %j', (input) => {
    expect(evaluate(input)).toBeNull();
  });
});

describe('evaluateLoose', () => {
  it('ignores a trailing operator while typing', () => {
    expect(evaluateLoose('100+')).toBe(100);
    expect(evaluateLoose('100+(')).toBe(100);
  });
});

describe('round2', () => {
  it('rounds half up at the cent', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});
