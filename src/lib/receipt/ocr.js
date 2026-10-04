// Vendored from receipt_test@b9dd94a , bench/lib/ocr.js. Keep in sync with that repo; avoid local edits.
// PaddleOCR wrapper + conversion of OCR boxes into layout-preserving text,
// which is what the text LLM engines read.
import { PaddleOCR } from 'https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm';

// Measured on the 11 test receipts (share of ground-truth amounts present in OCR text):
// v6-small 97%, v6-tiny 93%, v5-mobile 83%.
export const OCR_MODELS = {
  'v6-small': { label: 'PP-OCRv6 small (31 MB)', opts: { textDetectionModelName: 'PP-OCRv6_small_det', textRecognitionModelName: 'PP-OCRv6_small_rec' } },
  'v6-tiny': { label: 'PP-OCRv6 tiny (6 MB)', opts: { textDetectionModelName: 'PP-OCRv6_tiny_det', textRecognitionModelName: 'PP-OCRv6_tiny_rec' } },
  'v5-mobile': { label: 'PP-OCRv5 mobile (21 MB)', opts: { textDetectionModelName: 'PP-OCRv5_mobile_det', textRecognitionModelName: 'PP-OCRv5_mobile_rec' } },
};

const cache = new Map();
export async function getOcr(key = 'v6-small') {
  if (!cache.has(key)) {
    cache.set(key, PaddleOCR.create({
      ...OCR_MODELS[key].opts,
      ortOptions: { backend: 'auto', numThreads: Math.min(4, navigator.hardwareConcurrency || 2) },
    }).catch(e => { cache.delete(key); throw e; }));
  }
  return cache.get(key);
}

// Engines share one OCR pass per image. `ocrMs` is the original OCR time, so
// timings stay honest when a later engine gets the cached result.
const results = new WeakMap();
export async function runOcr(image, key = 'v6-small', params = {}) {
  const ck = key + JSON.stringify(params);
  const perImage = results.get(image) ?? new Map();
  results.set(image, perImage);
  if (!perImage.has(ck)) {
    perImage.set(ck, (async () => {
      const ocr = await getOcr(key);
      const t0 = performance.now();
      const [res] = await ocr.predict(image, { textDetLimitType: 'max', textDetLimitSideLen: 1600, ...params });
      const boxes = deskew(toBoxes(res.items || []));
      boxes.ocrMs = performance.now() - t0;
      return boxes;
    })().catch(e => { perImage.delete(ck); throw e; }));
  }
  return perImage.get(ck);
}

export function toBoxes(items) {
  return items.map(it => {
    const poly = it.poly || [];
    const [p0, p1, , p3] = poly;
    // Text direction from the top edge; height from the left edge (works for rotated quads).
    const angle = p0 && p1 ? Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) : 0;
    const height = p0 && p3 ? Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) : 0;
    return fromPoly({ text: (it.text || '').trim(), score: it.score, poly, angle, height });
  }).filter(b => b.text && Number.isFinite(b.left));
}

function fromPoly(b) {
  const xs = b.poly.map(p => p[0]), ys = b.poly.map(p => p[1]);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  // Rotated boxes have tall axis-aligned bounds; use the quad's own height for h.
  const h = b.height && Math.abs(b.angle) > 0.05 ? b.height : bottom - top;
  return { ...b, left, right, top, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2, h };
}

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

// Rotates all boxes so the dominant text direction is horizontal. Uses the
// angle of wide boxes (short boxes like "1" have unreliable angles). Handles
// any tilt; upside-down text is PaddleOCR's orientation classifier's job.
export function deskew(boxes) {
  const wide = boxes.filter(b => b.poly.length === 4 && (b.right - b.left) > 2 * b.h);
  const theta = median(wide.map(b => b.angle));
  boxes.skewDeg = +(theta * 180 / Math.PI).toFixed(1);
  if (!wide.length || Math.abs(theta) < 0.5 * Math.PI / 180) return boxes;
  const cos = Math.cos(-theta), sin = Math.sin(-theta);
  // poly0 keeps the original image coordinates (used for cropping).
  const rotated = boxes.map(b => fromPoly({ ...b, poly0: b.poly, angle: b.angle - theta, poly: b.poly.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]) }));
  rotated.skewDeg = boxes.skewDeg;
  return rotated;
}

// Groups boxes into rows. A box joins a row when its vertical centre is within
// ~half a text height of where the row is at that x (following the row's local
// slope, so mildly curled paper still groups correctly).
export function toLines(boxes) {
  const mh = median(boxes.map(b => b.h)) || 10;
  const sorted = [...boxes].sort((a, b) => a.cy - b.cy);
  const lines = [];
  // Row height at x, following the slope of the nearest wide box (short boxes
  // have unreliable angles). Either the sloped or the flat estimate may match.
  const rowYAt = (l, x) => {
    const o = l.boxes.reduce((a, c) => (Math.abs(c.cx - x) < Math.abs(a.cx - x) ? c : a));
    const slope = (o.right - o.left) > 3 * o.h ? Math.tan(o.angle || 0) : 0;
    return o.cy + slope * (x - o.cx);
  };
  for (const b of sorted) {
    let best = null, bestD = mh * 0.5;
    for (const l of lines) {
      if (l.boxes.some(o => overlapX(o, b))) continue;
      const d = Math.min(Math.abs(rowYAt(l, b.cx) - b.cy), Math.abs(l.cy - b.cy));
      if (d < bestD) { bestD = d; best = l; }
    }
    if (best) { best.boxes.push(b); best.cy = (best.cy * (best.boxes.length - 1) + b.cy) / best.boxes.length; }
    else lines.push({ cy: b.cy, boxes: [b] });
  }
  lines.sort((a, b) => a.cy - b.cy);
  lines.forEach(l => l.boxes.sort((a, b) => a.left - b.left));
  return lines;
}
const overlapX = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > Math.min(a.right - a.left, b.right - b.left) * 0.5;

// Places each box at a character column proportional to its x position so
// columns (name ... qty ... price) stay visually aligned for the LLM.
export function layoutText(boxes, maxCols = 100) {
  if (!boxes.length) return '';
  const lines = toLines(boxes);
  const minX = Math.min(...boxes.map(b => b.left)), maxX = Math.max(...boxes.map(b => b.right));
  const charW = median(boxes.map(b => (b.right - b.left) / Math.max(1, b.text.length))) || 8;
  const scale = Math.min(1, maxCols / ((maxX - minX) / charW));
  return lines.map(l => {
    let s = '';
    for (const b of l.boxes) {
      const col = Math.round(((b.left - minX) / charW) * scale);
      s += (s.length < col ? ' '.repeat(col - s.length) : s.length ? ' ' : '') + b.text;
    }
    return s.trimEnd();
  }).join('\n');
}

export const plainText = boxes => toLines(boxes).map(l => l.boxes.map(b => b.text).join(' ')).join('\n');
