// src/lib/receipt/paddle-lazy.js
// Stand-in for the PaddleOCR CDN module (wired up by an alias in vite.config.js).
// The vendored ocr.js imports PaddleOCR statically, which would download ~12 MB of JS
// (OpenCV, ONNX runtime) as soon as the scanner opens, and fail offline before the reader
// is downloaded. This shim defers that download until an OCR instance is actually created,
// so text PDFs and the crop editor work without it. The vendored files stay unmodified.

// A variable (not a literal) so the alias that points here doesn't rewrite this import.
const PADDLE_URL = 'https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm';

let real = null;
const load = () => (real ??= import(/* @vite-ignore */ PADDLE_URL).catch((e) => {
  real = null;
  throw e;
}));

export const PaddleOCR = {
  async create(...args) {
    const mod = await load();
    return mod.PaddleOCR.create(...args);
  },
};
