// src/lib/math.js
// Tiny recursive-descent evaluator for amount fields ("120+45.5", "300/3", "(2*49)-10").
// Replaces the previous `new Function(...)` evaluation.

export function evaluate(input) {
  const src = String(input ?? '').replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/');
  if (!src) return null;
  let i = 0;

  const peek = () => src[i];
  const number = () => {
    const start = i;
    while (i < src.length && /[0-9.]/.test(src[i])) i++;
    if (start === i) throw new Error('number expected');
    const n = Number(src.slice(start, i));
    if (!Number.isFinite(n)) throw new Error('bad number');
    return n;
  };
  const factor = () => {
    if (peek() === '-') { i++; return -factor(); }
    if (peek() === '+') { i++; return factor(); }
    if (peek() === '(') {
      i++;
      const v = expr();
      if (peek() !== ')') throw new Error(') expected');
      i++;
      return v;
    }
    return number();
  };
  const term = () => {
    let v = factor();
    while (peek() === '*' || peek() === '/') {
      const op = src[i++];
      const r = factor();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const expr = () => {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = src[i++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };

  try {
    const v = expr();
    if (i !== src.length || !Number.isFinite(v)) return null;
    return v;
  } catch {
    return null;
  }
}

/** Like evaluate(), but tolerates a trailing operator while the user is still typing. */
export function evaluateLoose(input) {
  const v = evaluate(input);
  if (v !== null) return v;
  return evaluate(String(input ?? '').replace(/[+\-*/(.]+$/, ''));
}

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
