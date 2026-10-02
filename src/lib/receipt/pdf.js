// src/lib/receipt/pdf.js
// PDF bills via pdf.js (bundled, loaded only when a PDF is opened, cached offline by the
// service worker like the rest of the app). Renders the first page for the preview /
// attachment and extracts positioned text from the first few pages.
import { getDocument, GlobalWorkerOptions, PasswordException, Util } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

/** Fetches the pdf.js worker so the service worker has it for offline use. */
export const warmPdf = () => fetch(workerUrl).then((r) => r.ok).catch(() => false);

export class PdfPasswordError extends Error {
  constructor() {
    super('This PDF is password-protected. Open it, take a screenshot of the bill, and scan that instead.');
    this.name = 'PdfPasswordError';
  }
}

/**
 * @returns {Promise<{ canvas: HTMLCanvasElement, runs: Array<{str,x,y,w,h}>, numPages: number }>}
 *   canvas: page 1 rendered at `scale`; runs: text from up to `maxPages` pages stacked vertically
 */
export async function loadPdf(file, { maxPages = 3, scale = 2, maxSide = 2400 } = {}) {
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    task.destroy?.();
    if (e instanceof PasswordException || e?.name === 'PasswordException') throw new PdfPasswordError();
    throw new Error('Couldn’t open this PDF.');
  }
  try {
    const first = await doc.getPage(1);
    const base = first.getViewport({ scale: 1 });
    const s = Math.min(scale, maxSide / Math.max(base.width, base.height));
    const vp = first.getViewport({ scale: s });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    // 'print' renders in one pass; the default 'display' intent waits on animation frames,
    // which stall if the app is in the background (and in headless/hidden tabs).
    await first.render({ canvas, viewport: vp, intent: 'print' }).promise;

    const runs = [];
    let yOffset = 0;
    const pages = Math.min(doc.numPages, maxPages);
    for (let p = 1; p <= pages; p++) {
      const page = p === 1 ? first : await doc.getPage(p);
      const pvp = page.getViewport({ scale: s });
      const content = await page.getTextContent();
      for (const it of content.items) {
        if (!it.str?.trim()) continue;
        // Text matrix in page pixels: [a, b, c, d, x, baselineY]; font height = |(c, d)|.
        const [, , c, d, x, baseline] = Util.transform(pvp.transform, it.transform);
        const h = Math.hypot(c, d);
        runs.push({ str: it.str, x, y: baseline - h + yOffset, w: it.width * s, h });
      }
      yOffset += pvp.height;
    }
    return { canvas, runs, numPages: doc.numPages };
  } finally {
    // Frees the worker and the document's memory (the loading task owns them in pdf.js 6).
    task.destroy?.();
  }
}
