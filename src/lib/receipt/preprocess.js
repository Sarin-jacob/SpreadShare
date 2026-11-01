// Vendored from receipt_test@00cd50e , bench/lib/preprocess.js. Keep in sync with that repo; avoid local edits.
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

// Height / width above which an image is a long scrolling screenshot, read in slices: shrunk to
// fit one OCR pass, its text would be too small to read.
export const TALL = 2.6; // (phone screens are up to ~21:9 = 2.33)

// Colour of the text in a box's pixels (RGBA): 'green' / 'red' / null (black, white, grey,
// anything else). Apps print money received in green; spends in red only sometimes.
export function inkColor(data) {
  const n = data.length / 4;
  if (n < 16) return null;
  const px = [];
  for (let i = 0; i < n; i++) px.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11]);
  const chroma = (p) => Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]);
  const bg = [...px].sort((a, b) => a[3] - b[3])[n >> 1]; // text covers less than half a box
  if (chroma(bg) > 40) return null; // white text on a coloured button / chip, not coloured text
  // The strokes: the tenth of the pixels furthest from the background (dark text on a light page,
  // light text on a dark one). Thin or downscaled text is faint, so compare channels, not levels.
  const far = [...px].sort((a, b) => Math.abs(b[3] - bg[3]) - Math.abs(a[3] - bg[3])).slice(0, Math.max(4, Math.ceil(n * 0.1)));
  const [r, g, b, l] = [0, 1, 2, 3].map((k) => far.reduce((s, p) => s + p[k], 0) / far.length);
  if (Math.abs(l - bg[3]) < 30) return null; // a blank box
  if (g - Math.max(r, b) >= 12 && chroma([r, g, b]) >= 25) return 'green';
  if (r - Math.max(g, b) >= 25 && chroma([r, g, b]) >= 40) return 'red';
  return null;
}

/**
 * OCR of a long image in overlapping slices at a legible width; boxes come back in one coordinate
 * space (the source's, scaled by `boxes.scale`). ink: also each box's text colour (inkColor).
 */
export async function ocrSlices(source, ocrModel = 'v6-small', { width = 1200, ratio = 1.4, overlap = 0.15, ink = false } = {}) {
  const w = source.width, H = source.height;
  const s = Math.min(2.5, width / w); // small (downscaled) screenshots are enlarged too
  const sliceH = Math.round(w * ratio);
  const step = Math.round(sliceH * (1 - overlap));
  const all = [];
  for (let y0 = 0; ; y0 += step) {
    const y1 = Math.min(H, y0 + sliceH);
    const c = document.createElement('canvas');
    c.width = Math.round(w * s);
    c.height = Math.round((y1 - y0) * s);
    const g = c.getContext('2d', { willReadFrequently: ink });
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingQuality = 'high';
    g.drawImage(source, 0, y0, w, y1 - y0, 0, 0, c.width, c.height);
    const boxes = await runOcr(c, ocrModel);
    // Each row from the slice where it's furthest from the edge, so the overlaps aren't doubled.
    const keepFrom = y0 === 0 ? -Infinity : ((sliceH * overlap) / 2) * s;
    const keepTo = y1 >= H ? Infinity : (sliceH - (sliceH * overlap) / 2) * s;
    const dy = y0 * s;
    for (const b of boxes) {
      if (b.cy < keepFrom || b.cy >= keepTo) continue;
      let color = null;
      if (ink) {
        const x = Math.max(0, Math.floor(b.left)), y = Math.max(0, Math.floor(b.top));
        const bw = Math.min(c.width - x, Math.ceil(b.right - b.left)), bh = Math.min(c.height - y, Math.ceil(b.bottom - b.top));
        if (bw > 0 && bh > 0) color = inkColor(g.getImageData(x, y, bw, bh).data);
      }
      const shift = (p) => p && p.map(([px, py]) => [px, py + dy]);
      all.push({ ...b, top: b.top + dy, bottom: b.bottom + dy, cy: b.cy + dy, poly: shift(b.poly), ...(b.poly0 ? { poly0: shift(b.poly0) } : {}), ...(ink ? { ink: color } : {}) });
    }
    if (y1 >= H) break;
  }
  all.skewDeg = 0;
  all.scale = s;
  return all;
}

// Full pipeline: OCR once; if the text only covers part of the photo, crop the
// full-resolution original to it and OCR again (more pixels per character).
// Long scrolling screenshots are read in slices instead.
export async function ocrPhoto(source, { ocrModel = 'v6-small', contrast = false, crop = true, cropBelow = 0.6 } = {}) {
  if (source.height / source.width > TALL) {
    const boxes = await ocrSlices(source, ocrModel);
    boxes.info = { passes: 'slices', skewDeg: 0, size: [Math.round(source.width * boxes.scale), Math.round(source.height * boxes.scale)] };
    return boxes;
  }
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
