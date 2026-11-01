// src/lib/receipt/listReader.js
// Text lines from a transaction-list screenshot or statement PDF, for txnList.js. Screenshots
// go through the same on-device OCR as receipts; long scrolling screenshots are read in
// overlapping slices so the text isn't shrunk below what OCR can read.
import { toBoxes, toLines } from './ocr.js';
import { ocrSlices } from './preprocess.js';
import { runsToOcrItems, hasUsableText, isPdf } from './pdfText.js';

const OCR_MODEL = 'v6-small';

/**
 * Lines with their text, where they end horizontally (0..1 of the page's text width), and the
 * colour of their amount when it's printed in colour ('green' / 'red', see preprocess.js inkColor).
 */
function linesFrom(boxes) {
  if (!boxes.length) return [];
  const minX = Math.min(...boxes.map((b) => b.left));
  const width = Math.max(...boxes.map((b) => b.right)) - minX || 1;
  return toLines(boxes).map((l) => {
    const money = l.boxes.filter((b) => /\d/.test(b.text)).at(-1);
    return {
      text: l.boxes.map((b) => b.text).join(' '),
      right: (Math.max(...l.boxes.map((b) => b.right)) - minX) / width,
      ...(money?.ink ? { ink: money.ink } : {}),
    };
  });
}

/** OCR of an image of any height, slice by slice so a long screenshot's text stays legible. */
const ocrImage = (source) => ocrSlices(source, OCR_MODEL, { ink: true });

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
