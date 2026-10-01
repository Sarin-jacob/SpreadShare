// Vendored from receipt_test@8125280 , bench/lib/preprocess.js. Keep in sync with that repo; avoid local edits.
// Image preprocessing for phone photos of receipts. Everything here is plain
// canvas work (no extra downloads).
import { runOcr } from './ocr.js';

// Draws `source` (ImageBitmap/canvas) region into a new canvas, scaled so the
// long side lands in [minLong, maxLong] (small images are upscaled up to 2.5×).
export function toCanvas(source, { sx = 0, sy = 0, sw = source.width, sh = source.height, minLong = 1400, maxLong = 2400 } = {}) {
  const long = Math.max(sw, sh);
  const s = long < minLong ? Math.min(2.5, minLong / long) : long > maxLong ? maxLong / long : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(sw * s); c.height = Math.round(sh * s);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); // flatten transparency
  g.imageSmoothingQuality = 'high';
  g.drawImage(source, sx, sy, sw, sh, 0, 0, c.width, c.height);
  c.scale = s; c.offset = [sx, sy];
  return c;
}

// Contrast stretch: maps the 1st..99th luminance percentile to 0..255 and lifts
// dark photos with a gamma curve. Helps night-time / shadowed shots.
export function enhance(canvas) {
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const img = g.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data, hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[(d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8]++;
  const n = d.length / 4;
  let lo = 0, hi = 255, acc = 0;
  for (; lo < 255 && (acc += hist[lo]) < n * 0.01; lo++);
  acc = 0;
  for (; hi > 0 && (acc += hist[hi]) < n * 0.01; hi--);
  if (hi - lo < 10) return canvas;
  let mean = 0;
  for (let v = 0; v < 256; v++) mean += v * hist[v];
  mean /= n;
  // Already well exposed (typical scans/screenshots): leave it alone.
  if (hi - lo > 200 && mean >= 100) return canvas;
  const gamma = mean < 100 ? 0.7 : 1; // brighten dark photos
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(Math.min(1, Math.max(0, (v - lo) / (hi - lo))), gamma);
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  const out = document.createElement('canvas');
  out.width = canvas.width; out.height = canvas.height;
  out.getContext('2d').putImageData(img, 0, 0);
  out.scale = canvas.scale; out.offset = canvas.offset;
  return out;
}

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]; };

// Bounding box (in source pixels) of the text found in a first OCR pass.
export function contentBox(boxes, canvas, source) {
  const pts = boxes.filter(b => (b.score ?? 1) > 0.6).flatMap(b => b.poly0 ?? b.poly);
  if (pts.length < 8) return null;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  let x0 = pct(xs, 0.01), x1 = pct(xs, 0.99), y0 = pct(ys, 0.01), y1 = pct(ys, 0.99);
  const mx = (x1 - x0) * 0.04 + 10, my = (y1 - y0) * 0.03 + 10;
  const s = canvas.scale ?? 1, [ox, oy] = canvas.offset ?? [0, 0];
  x0 = Math.max(0, (x0 - mx) / s + ox); y0 = Math.max(0, (y0 - my) / s + oy);
  x1 = Math.min(source.width, (x1 + mx) / s + ox); y1 = Math.min(source.height, (y1 + my) / s + oy);
  return { sx: x0, sy: y0, sw: x1 - x0, sh: y1 - y0 };
}

// Full pipeline: OCR once; if the text only covers part of the photo, crop the
// full-resolution original to it and OCR again (more pixels per character).
export async function ocrPhoto(source, { ocrModel = 'v6-small', contrast = false, crop = true, cropBelow = 0.6 } = {}) {
  let canvas = toCanvas(source);
  if (contrast) canvas = enhance(canvas);
  let boxes = await runOcr(canvas, ocrModel);
  const info = { passes: 1, skewDeg: boxes.skewDeg, size: [canvas.width, canvas.height] };
  if (crop) {
    const box = contentBox(boxes, canvas, source);
    if (box && (box.sw * box.sh) / (source.width * source.height) < cropBelow) {
      let c2 = toCanvas(source, box);
      if (contrast) c2 = enhance(c2);
      boxes = await runOcr(c2, ocrModel);
      Object.assign(info, { passes: 2, crop: box, size: [c2.width, c2.height], skewDeg: boxes.skewDeg });
    }
  }
  boxes.info = info;
  return boxes;
}
