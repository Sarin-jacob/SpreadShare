// src/lib/receipt/listReader.js
// Text lines from a transaction-list screenshot or statement PDF, for txnList.js. Screenshots
// go through the same on-device OCR as receipts; long scrolling screenshots are read in
// overlapping slices so the text isn't shrunk below what OCR can read.
import { runOcr, toBoxes, toLines } from './ocr.js';
import { runsToOcrItems, hasUsableText, isPdf } from './pdfText.js';

const OCR_MODEL = 'v6-small';
const MAX_WIDTH = 1200; // px of screenshot width sent to OCR; phone text stays legible
const SLICE_RATIO = 1.4; // slice height / width
const OVERLAP = 0.15; // of a slice, so a row cut by one slice is whole in the next

/** Lines with their text and where they end horizontally (0..1 of the page's text width). */
function linesFrom(boxes) {
  if (!boxes.length) return [];
  const minX = Math.min(...boxes.map((b) => b.left));
  const width = Math.max(...boxes.map((b) => b.right)) - minX || 1;
  return toLines(boxes).map((l) => ({
    text: l.boxes.map((b) => b.text).join(' '),
    right: (Math.max(...l.boxes.map((b) => b.right)) - minX) / width,
  }));
}

/** OCR of an image of any height, slice by slice; boxes come back in one coordinate space. */
async function ocrImage(source) {
  const w = source.width;
  const s = Math.min(1, MAX_WIDTH / w);
  const sliceH = Math.round(w * SLICE_RATIO);
  const step = Math.round(sliceH * (1 - OVERLAP));
  const all = [];
  for (let y0 = 0; y0 < source.height; y0 += step) {
    const y1 = Math.min(source.height, y0 + sliceH);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * s);
    canvas.height = Math.round((y1 - y0) * s);
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(source, 0, y0, w, y1 - y0, 0, 0, canvas.width, canvas.height);
    const boxes = await runOcr(canvas, OCR_MODEL);
    // Keep each row from the slice where it's furthest from the edge, so overlaps aren't doubled.
    const first = y0 === 0;
    const last = y1 >= source.height;
    const keepFrom = first ? -Infinity : ((sliceH * OVERLAP) / 2) * s;
    const keepTo = last ? Infinity : (sliceH - (sliceH * OVERLAP) / 2) * s;
    for (const b of boxes) {
      if (b.cy < keepFrom || b.cy >= keepTo) continue;
      const dy = y0 * s;
      all.push({ ...b, top: b.top + dy, bottom: b.bottom + dy, cy: b.cy + dy, poly: b.poly.map(([x, y]) => [x, y + dy]) });
    }
    if (last) break;
  }
  return all;
}

/**
 * @returns {Promise<{ lines: Array<{ text: string, right: number }>, fromText: boolean, pages?: number }>}
 */
export async function readListLines(file) {
  if (isPdf(file)) {
    const { loadPdf } = await import('./pdf.js');
    const { canvas, runs, numPages } = await loadPdf(file, { maxPages: 30 });
    if (hasUsableText(runs)) return { lines: linesFrom(toBoxes(runsToOcrItems(runs))), fromText: true, pages: numPages };
    return { lines: linesFrom(await ocrImage(canvas)), fromText: false, pages: numPages }; // scanned: page 1
  }
  const bitmap = await createImageBitmap(file);
  try {
    return { lines: linesFrom(await ocrImage(bitmap)), fromText: false };
  } finally {
    bitmap.close?.();
  }
}
