# SpreadShare

**Live Demo:** [https://sarin-jacob.github.io/SpreadShare/](https://sarin-jacob.github.io/SpreadShare/)

A 100% serverless, local-first Progressive Web Application (PWA) for managing group expenses, tracking peer-to-peer debts, and splitting bills. SpreadShare bypasses traditional centralized backends by connecting directly to the user's personal Google Drive and Google Sheets via OAuth 2.0, ensuring absolute data privacy and ownership.

## Key Features

*   **Zero-Backend Architecture:** Ledger data is stored as a raw data sequence in Google Sheets. Configuration and receipt images are stored in Google Drive. 
*   **Advanced Split Engine:** Supports splitting equally, by custom weight shares, by exact amounts, or by relative adjustments (+/-). Inputs support inline mathematical evaluation.
*   **Optimized Settlements:** Utilizes a greedy algorithm to calculate the most efficient path to settle complex group debts, minimizing the total number of required transactions.
*   **Offline-First & PWA:** Built to work entirely offline. Transactions are stored in a local IndexedDB queue and automatically pushed to Google APIs when the network connection is restored.
*   **On-Device Image Compression:** Receipt uploads are intercepted, aggressively scaled down, and converted to WebP formats client-side to bypass payload limits and cross-site tracking blocks before uploading to Google Drive.
*   **Personal Analytics:** SVG charts for day-of-the-week spending, category breakdowns, per-group totals and daily trendlines.
*   **Deep Customization:** Light / dark / auto themes, OLED pure-black mode, 12 accent palettes, and global UI scaling.
*   **Accent-Tinted App Icon:** The app icon is a parametric SVG. The in-app logo recolours live, and the favicon, home-screen icon and PWA manifest switch to a matching icon set for the chosen accent.
*   **Installable:** Install prompt in Settings, and the home-screen icon shows a badge with the number of entries waiting to sync (where supported).

## Technical Stack

*   **Frontend:** Svelte 5 (runes), Vite, Tailwind CSS v4
*   **Authentication:** Google Identity Services (GSI) / OAuth 2.0 token model
*   **Database / Storage:** Google Sheets API v4, Google Drive API v3
*   **Local Caching:** IndexedDB (events cache + outbound queue), LocalStorage (profile, preferences)
*   **Visualization:** Inline SVG

## System Architecture

SpreadShare operates on a double-entry ledger system. Every action (Expense, Transfer, Loan) is recorded as an immutable event node in a Google Sheet. The application fetches these raw events and reconstructs the group's mathematical state on the client side.

1.  **Authentication:** The user logs in via Google. The app requests scopes exclusively for Sheets and Drive files created by the application itself.
2.  **Provisioning:** Upon creating a new group, the app provisions a hidden configuration file in Drive and a new Spreadsheet formatted to accept ledger entries.
3.  **Synchronization:** The app pulls the ledger data, caches it locally in IndexedDB, and computes balances. Any new transaction is written locally first for zero-latency UI updates, then queued for background sync.

## Roadmap

Upcoming features focused on bringing privacy-first, on-device AI to expense management via small client-side models running entirely in the browser:

- [ ] **Smart Auto-Categorization:** Context-aware prediction of expense categories based on the transaction title and description.
- [ ] **Receipt Auto-Parsing:** On-device Optical Character Recognition (OCR) to automatically extract totals, dates, and merchant names from uploaded images.
- [ ] **Item-Wise Bill Splitting:** Granular line-item extraction from scanned receipts, allowing users to assign specific items to specific members rather than splitting the grand total.

## Setup & Deployment

Because SpreadShare has no backend, deployment consists entirely of serving static files and configuring a Google Cloud Project.

### Prerequisites
1. A Google Cloud Console account.
2. A new project with the **Google Drive API** and **Google Sheets API** enabled.
3. An OAuth 2.0 Client ID configured for "Web application".
4. Add your deployment domain (e.g., `https://sarin-jacob.github.io`) or `http://localhost` for development to the Authorized JavaScript origins.

### Development
1. Clone the repository and run `npm install`.
2. Put your Google OAuth Client ID in `src/lib/config.js`.
3. `npm run dev` starts the app at `http://localhost:8080` (add that origin to your OAuth client).
4. `npm run check` type-checks the Svelte components.

### Project layout
```
src/
  App.svelte            app shell + hash routing
  views/                Groups, Group, ExpenseForm, ExpenseDetail, Insights, Settings, Login
  components/           Avatar, Donut, TrendChart, SyncStatus, Toasts, ...
  lib/
    app.svelte.js       global state, offline queue, sync orchestration
    google.js           raw Drive / Sheets API calls
    engine.js           rebuilds balances from the event log, settle-up optimiser
    insights.js         spending analytics
    auth.js, db.js, math.js, currency.js, ...
build/brand-icons.js    Vite plugin: renders the icon + manifest for every accent in app.css
public/                 service worker (copied as-is)
```

The app icon lives in `src/lib/brandIcon.js`. At build time, `build/brand-icons.js` reads the accent palettes from `src/app.css` and emits `icons/<accent>.svg`, `icons/<accent>-{180,192,512,maskable-512}.png` and `manifest-<accent>.webmanifest`. In dev, it serves the same files. Adding a palette to `app.css` automatically gives it an icon set.

### Deploying to GitHub Pages
```bash
npm run deploy
```
This builds into `dist/` and publishes it to the `gh-pages` branch (via the `gh-pages` package), with a `.nojekyll` marker. The build uses relative asset paths, so it works under `https://<user>.github.io/SpreadShare/` without extra config.
