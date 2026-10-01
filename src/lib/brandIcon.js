// src/lib/brandIcon.js
// The SpreadShare app icon as a parametric SVG: a spreadsheet with a ₹ coin, tinted by the accent.
// Shared by the in-app <Logo> (CSS variables) and the build-time icon generator (hex colours).
// Everything is drawn with paths , no text , so it rasterises identically without fonts.

/**
 * @param {Record<number,string>} c accent shades keyed 100..800 (hex or `var(--accent-500)`)
 * @param {{ id?: string, maskable?: boolean }} opts
 *   maskable: full-bleed background with content inside the 80% safe zone (Android adaptive icons)
 */
export function brandIconSvg(c, { id = 'ss', maskable = false } = {}) {
  const f = (color) => `style="fill:${color}"`;
  const stop = (offset, color) => `<stop offset="${offset}" style="stop-color:${color}"/>`;
  const content = maskable ? 'transform="translate(51.2 51.2) scale(0.8)"' : '';
  const bg = maskable
    ? `<rect width="512" height="512" fill="url(#${id}-bg)"/>`
    : `<rect x="16" y="16" width="480" height="480" rx="108" fill="url(#${id}-bg)"/>`;

  // Sheet outline with a folded top-right corner
  const sheet = 'M136 92H296L356 152V380a28 28 0 0 1-28 28H136a28 28 0 0 1-28-28V120a28 28 0 0 1 28-28Z';
  const rows = [216, 262, 308, 354]
    .map(
      (y, i) =>
        `<rect x="134" y="${y}" width="40" height="30" rx="7" ${f(i === 0 ? c[500] : c[100])}/>` +
        `<rect x="186" y="${y + 11}" width="${i % 2 ? 70 : 96}" height="8" rx="4" ${f(c[200])}/>`
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>
  <linearGradient id="${id}-bg" x1="0" y1="0" x2="1" y2="1">${stop(0, c[600])}${stop(1, c[800])}</linearGradient>
  <linearGradient id="${id}-coin" x1="0" y1="0" x2="1" y2="1">${stop(0, c[500])}${stop(1, c[700])}</linearGradient>
  <clipPath id="${id}-sheet"><path d="${sheet}"/></clipPath>
</defs>
${bg}
<g ${content}>
  <path d="${sheet}" fill="#f8fafc"/>
  <g clip-path="url(#${id}-sheet)">
    <rect x="100" y="84" width="270" height="100" ${f(c[600])}/>
  </g>
  <path d="M296 92V132a20 20 0 0 0 20 20H356Z" ${f(c[300])}/>
  <rect x="134" y="114" width="62" height="50" rx="9" fill="#f8fafc"/>
  <g ${f(c[600])}>
    <rect x="143" y="122" width="19" height="14" rx="2"/><rect x="168" y="122" width="19" height="14" rx="2"/>
    <rect x="143" y="142" width="19" height="14" rx="2"/><rect x="168" y="142" width="19" height="14" rx="2"/>
  </g>
  ${rows}
  <circle cx="346" cy="346" r="122" ${f(c[300])}/>
  <circle cx="346" cy="346" r="106" fill="url(#${id}-coin)"/>
  <g fill="none" stroke="#fbbf24" stroke-width="22" stroke-linecap="round" stroke-linejoin="round">
    <path d="M300 290H392"/>
    <path d="M300 322H392"/>
    <path d="M320 290a32 32 0 0 1 0 64H302L370 412"/>
  </g>
</g>
</svg>`;
}

/** Accent shades as CSS variables, for inline use inside the app. */
export const CSS_VAR_SHADES = Object.fromEntries(
  [100, 200, 300, 500, 600, 700, 800].map((n) => [n, `var(--accent-${n})`])
);
