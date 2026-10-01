// Stand-in for the PaddleOCR CDN module in unit tests (the solver only needs ocr.js's pure helpers).
export const PaddleOCR = {
  create() {
    throw new Error('PaddleOCR is not available in unit tests');
  },
};
