// src/lib/receipt/index.js
// On-device receipt scanning: PaddleOCR (PP-OCRv6 small) + an arithmetic line solver.
// This module is imported lazily by the scanner so the OCR code and model download only
// happen when someone actually scans. Parser modules are vendored from receipt_test@8125280.
import { getOcr } from './ocr.js';
import { ocrPhoto } from './preprocess.js';
import { solveReceipt } from './solver.js';
import { normalize } from './schema.js';
import { audit } from './audit.js';

export * from './image.js';
export * from './draft.js';

export const OCR_MODEL = 'v6-small';
export const OCR_DOWNLOAD_MB = 31;

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
 * Reads a flattened receipt image.
 * @param {HTMLCanvasElement} flat output of warp() + applyAdjustments()
 * @returns {Promise<{ receipt: object, check: { ok: boolean, checks: object[] }, lines: string, ms: number }>}
 */
export async function scanReceipt(flat) {
  await preloadOcr();
  const t0 = performance.now();
  const boxes = await ocrPhoto(flat, { ocrModel: OCR_MODEL, crop: true, contrast: false });
  // eslint-disable-next-line no-unused-vars
  const { _lines, _debug, ...raw } = solveReceipt(boxes);
  const receipt = normalize(raw);
  return { receipt, check: audit(receipt), lines: _lines, ms: performance.now() - t0 };
}
