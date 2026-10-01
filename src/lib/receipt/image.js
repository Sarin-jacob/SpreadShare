// src/lib/receipt/image.js
// Photo handling for the receipt scanner, ported from receipt_test@8125280 scan/scan.js:
// load → auto-detect the paper's corners → perspective-flatten → brightness / contrast / B&W.
import { enhance } from './preprocess.js';

export const MAX_SOURCE = 3000; // working copy of the photo
export const MAX_OUTPUT = 2400; // flattened receipt sent to OCR

export function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Decodes a photo (honouring EXIF rotation) into a canvas no larger than MAX_SOURCE. */
export async function loadPhoto(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, MAX_SOURCE / Math.max(bmp.width, bmp.height));
  const c = canvasOf(Math.round(bmp.width * s), Math.round(bmp.height * s));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

export function rotate(src, dir) {
  const r = canvasOf(src.height, src.width);
  const g = r.getContext('2d');
  g.translate(r.width / 2, r.height / 2);
  g.rotate((dir * Math.PI) / 2);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return r;
}

export const fullQuad = (src) => [[0, 0], [src.width, 0], [src.width, src.height], [0, src.height]];

// ---------- automatic corners ----------
// Receipts are usually the brightest large region in the photo. Threshold a
// small copy (Otsu), keep the biggest bright blob and take its extreme corners.
export function autoQuad(src) {
  const full = fullQuad(src);
  const s = 320 / Math.max(src.width, src.height);
  const w = Math.max(1, Math.round(src.width * s)), h = Math.max(1, Math.round(src.height * s));
  const small = canvasOf(w, h);
  const g = small.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const lum = new Uint8Array(w * h), hist = new Uint32Array(256);
  for (let i = 0; i < w * h; i++) { lum[i] = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8; hist[lum[i]]++; }
  const t = otsu(hist, w * h);
  // Largest 4-connected bright component.
  const seen = new Uint8Array(w * h);
  let best = null;
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || lum[start] <= t) continue;
    const stack = [start], pts = [];
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop();
      pts.push(p);
      const x = p % w, y = (p / w) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && !seen[q] && lum[q] > t) { seen[q] = 1; stack.push(q); }
      }
    }
    if (!best || pts.length > best.length) best = pts;
  }
  if (!best) return full;
  const area = best.length / (w * h);
  if (area < 0.08 || area > 0.92) return full; // nothing paper-like, or a screenshot/scan
  const rect = minAreaRect(hull(best.map((p) => [p % w, (p / w) | 0])));
  if (!rect) return full;
  // Pad a little so the paper edge (and any text on it) stays inside.
  const cx = rect.reduce((a, p) => a + p[0], 0) / 4, cy = rect.reduce((a, p) => a + p[1], 0) / 4;
  return rect.map(([x, y]) => [
    Math.min(src.width, Math.max(0, (cx + (x - cx) * 1.03) / s)),
    Math.min(src.height, Math.max(0, (cy + (y - cy) * 1.03) / s)),
  ]);
}

// Convex hull (monotone chain).
function hull(pts) {
  pts = [...new Map(pts.map((p) => [p[0] * 10000 + p[1], p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// Smallest rectangle around the hull (tries each hull edge as a side). Returns
// corners ordered tl, tr, br, bl in the rectangle's own frame, with "top" being
// the side closest to horizontal, so a tilted receipt comes out upright.
function minAreaRect(h) {
  if (h.length < 3) return null;
  let best = null;
  for (let i = 0; i < h.length; i++) {
    const [x1, y1] = h[i], [x2, y2] = h[(i + 1) % h.length];
    let a = Math.atan2(y2 - y1, x2 - x1);
    while (a > Math.PI / 4) a -= Math.PI / 2;
    while (a <= -Math.PI / 4) a += Math.PI / 2;
    const c = Math.cos(a), s = Math.sin(a);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, y] of h) {
      const u = x * c + y * s, v = -x * s + y * c;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, c, s, u0, u1, v0, v1 };
  }
  const { c, s, u0, u1, v0, v1 } = best;
  const back = (u, v) => [u * c - v * s, u * s + v * c];
  let q = [back(u0, v0), back(u1, v0), back(u1, v1), back(u0, v1)];
  // Receipts are portrait: if the "top" side is the long one, turn a quarter,
  // choosing the turn that keeps the top edge nearer the top of the photo.
  if (u1 - u0 > (v1 - v0) * 1.15) {
    const cw = [q[3], q[0], q[1], q[2]], ccw = [q[1], q[2], q[3], q[0]];
    const topY = (r) => (r[0][1] + r[1][1]) / 2;
    q = topY(cw) <= topY(ccw) ? cw : ccw;
  }
  return q;
}

function otsu(hist, n) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, t = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; t = i; }
  }
  return t;
}

// ---------- flatten + enhance ----------
/** Maps the quadrilateral `q` (tl, tr, br, bl) to an upright rectangle (perspective correction). */
export function warp(src, q) {
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let W = Math.max(dist(q[0], q[1]), dist(q[3], q[2])), H = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const s = Math.min(1, MAX_OUTPUT / Math.max(W, H));
  W = Math.max(1, Math.round(W * s)); H = Math.max(1, Math.round(H * s));
  const out = canvasOf(W, H);
  const Hm = homography([[0, 0], [W, 0], [W, H], [0, H]], q);
  const sd = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, src.width, src.height).data;
  const og = out.getContext('2d');
  const img = og.createImageData(W, H), od = img.data;
  const sw = src.width, sh = src.height;
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      const z = Hm[6] * u + Hm[7] * v + 1;
      const x = (Hm[0] * u + Hm[1] * v + Hm[2]) / z, y = (Hm[3] * u + Hm[4] * v + Hm[5]) / z;
      const o = (v * W + u) * 4;
      if (x < 0 || y < 0 || x >= sw - 1 || y >= sh - 1) { od[o] = od[o + 1] = od[o + 2] = 255; od[o + 3] = 255; continue; }
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      for (let c = 0; c < 3; c++) {
        od[o + c] = (sd[i00 + c] * (1 - fx) + sd[i10 + c] * fx) * (1 - fy) + (sd[i01 + c] * (1 - fx) + sd[i11 + c] * fx) * fy;
      }
      od[o + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}

// Solves the 8 homography coefficients mapping `from` points onto `to` points.
export function homography(from, to) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i], [X, Y] = to[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
  }
  // Gaussian elimination with partial pivoting.
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < 8; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = new Array(8);
  for (let r = 7; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < 8; k++) s -= A[r][k] * h[k];
    h[r] = s / A[r][r];
  }
  return h;
}

/** CSS filter matching applyAdjustments(), for the live preview. */
export const previewFilter = (a) =>
  `brightness(${1 + a.bright / 100}) contrast(${1 + a.contrast / 100}) grayscale(${a.gray ? 1 : 0})`;

/** Same adjustments as the preview, applied to pixels. */
export function applyAdjustments(canvas, a) {
  let c = a.autoLevels ? enhance(canvas) : canvas;
  if (!a.bright && !a.contrast && !a.gray) return c;
  const g = c.getContext('2d', { willReadFrequently: true });
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  const k = 1 + a.contrast / 100, add = a.bright * 2.55;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = (v - 128) * k + 128 + add;
  for (let i = 0; i < d.length; i += 4) {
    if (a.gray) { const l = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8; d[i] = d[i + 1] = d[i + 2] = lut[l]; }
    else { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  }
  if (c === canvas) c = canvasOf(canvas.width, canvas.height);
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

/** Downscaled, compressed copy of a canvas for attaching to an expense. */
export function canvasToDataUrl(canvas, { maxSize = 1400, quality = 0.7 } = {}) {
  const s = Math.min(1, maxSize / Math.max(canvas.width, canvas.height));
  const c = canvasOf(Math.round(canvas.width * s), Math.round(canvas.height * s));
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  const webp = c.toDataURL('image/webp', quality);
  return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', quality);
}
