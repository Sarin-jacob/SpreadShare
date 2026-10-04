// src/lib/receipt/index.js
// On-device receipt scanning: PaddleOCR (PP-OCRv6 small) + an arithmetic line solver.
// This module is imported lazily by the scanner so the OCR code and model download only
// happen when someone actually scans. Parser modules are vendored from receipt_test@b9dd94a.
// Same specifier as ocr.js, so both share one module instance.
import { PaddleOCR } from 'https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm';
import { getOcr, OCR_MODELS, toBoxes } from './ocr.js';
import { ocrPhoto } from './preprocess.js';
import { solveReceipt } from './solver.js';
import { normalize } from './schema.js';
import { audit } from './audit.js';
import { runsToOcrItems, hasUsableText } from './pdfText.js';

export * from './image.js';
export * from './draft.js';
export { isPdf } from './pdfText.js';

function solve(boxes, t0) {
  // eslint-disable-next-line no-unused-vars
  const { _lines, _debug, ...raw } = solveReceipt(boxes);
  const receipt = normalize(raw);
  return { receipt, check: audit(receipt), lines: _lines, ms: performance.now() - t0 };
}

/**
 * Opens a PDF bill. Text PDFs are read directly (no OCR, exact numbers); scanned PDFs return
 * only the rendered page, to go through the crop editor and OCR like a photo.
 * @returns {Promise<{ canvas: HTMLCanvasElement, result: object|null, numPages: number }>}
 */
export async function readPdf(file) {
  const t0 = performance.now();
  const { loadPdf } = await import('./pdf.js'); // pdf.js is its own chunk
  const { canvas, runs, numPages } = await loadPdf(file);
  if (!hasUsableText(runs)) return { canvas, result: null, numPages };
  const result = solve(toBoxes(runsToOcrItems(runs)), t0);
  return { canvas, result: { ...result, fromText: true }, numPages };
}

export const OCR_MODEL = 'v6-small';
/** One-time download: OCR models (~30 MB) + OpenCV and the ONNX runtime (~37 MB). */
export const OCR_DOWNLOAD_MB = 67;

let ready = false;

/** Starts (or reuses) the OCR model download. Safe to call repeatedly. */
export function preloadOcr() {
  return getOcr(OCR_MODEL).then((ocr) => {
    ready = true;
    return ocr;
  });
}

export const isOcrReady = () => ready;

/**
 * Downloads every file the reader needs (through the service worker, which keeps them for
 * offline use) by starting a throwaway instance with the same options a scan uses, then
 * releases it so a background download doesn't hold ~100 MB of memory.
 */
export async function warmUp() {
  if (ready) return; // a scan already loaded (and the service worker cached) everything
  const ocr = await PaddleOCR.create({
    ...OCR_MODELS[OCR_MODEL].opts,
    ortOptions: { backend: 'auto', numThreads: Math.min(4, navigator.hardwareConcurrency || 2) },
  });
  try {
    // The ONNX runtime initialises lazily; one tiny recognition forces every file to load.
    const blank = document.createElement('canvas');
    blank.width = blank.height = 64;
    const g = blank.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 64, 64);
    await ocr.predict(blank);
  } finally {
    await ocr.dispose?.();
  }
}

/**
 * Reads a flattened receipt image.
 * @param {HTMLCanvasElement} flat output of warp() + applyAdjustments()
 * @returns {Promise<{ receipt: object, check: { ok: boolean, checks: object[] }, lines: string, ms: number }>}
 */
export async function scanReceipt(flat) {
  await preloadOcr();
  const t0 = performance.now();
  const boxes = await ocrPhoto(flat, { ocrModel: OCR_MODEL, crop: true, contrast: false });
  return solve(boxes, t0);
}
