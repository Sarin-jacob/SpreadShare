// src/lib/receipt/pdfText.js
// Text-based PDFs (most e-bills and invoices) already contain every word and its position, so
// they can skip OCR: their text runs are turned into the same box shape PaddleOCR produces and
// handed straight to the vendored solver. Pure — no pdf.js or DOM here.

/**
 * @param runs [{ str, x, y, w, h }] text runs in page pixels (y = top of the run)
 * @returns PaddleOCR-shaped items ({ text, score, poly }) for ocr.js toBoxes()
 */
export function runsToOcrItems(runs) {
  const out = [];
  for (const r of runs) {
    const str = String(r.str ?? '');
    if (!str.trim() || !(r.w > 0) || !(r.h > 0)) continue;
    // Some PDFs pad columns with spaces inside one run ("Subtotal        530.00");
    // split there so the solver sees label and amount as separate boxes, like OCR would.
    const charW = r.w / Math.max(1, str.length);
    for (const m of str.matchAll(/\S+(?: {1,2}\S+)*/g)) {
      const x = r.x + m.index * charW;
      const w = m[0].length * charW;
      out.push({ text: m[0], score: 1, poly: [[x, r.y], [x + w, r.y], [x + w, r.y + r.h], [x, r.y + r.h]] });
    }
  }
  return out;
}

/** Enough real text (with numbers) to read without OCR? Scanned PDFs have none. */
export function hasUsableText(runs) {
  const text = runs.map((r) => r.str || '').join(' ');
  const withDigits = runs.filter((r) => /\d/.test(r.str || '')).length;
  return text.replace(/\s+/g, '').length >= 30 && withDigits >= 2;
}

export const isPdf = (file) => file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '');
