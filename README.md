# SpreadShare

**Live Demo:** [https://sarin-jacob.github.io/SpreadShare/](https://sarin-jacob.github.io/SpreadShare/)

A 100% serverless, local-first Progressive Web Application (PWA) for managing group expenses, tracking peer-to-peer debts, and splitting bills. SpreadShare bypasses traditional centralized backends by connecting directly to the user's personal Google Drive and Google Sheets via OAuth 2.0, ensuring absolute data privacy and ownership.

## Key Features

*   **Zero-Backend Architecture:** Ledger data is stored as a raw data sequence in Google Sheets. Configuration and receipt images are stored in Google Drive. 
*   **Advanced Split Engine:** Supports splitting equally, by custom weight shares, by exact amounts, or by relative adjustments (+/-). Inputs support inline mathematical evaluation.
*   **Optimized Settlements:** Utilizes a greedy algorithm to calculate the most efficient path to settle complex group debts, minimizing the total number of required transactions.
*   **Fast Everyday Use:** Search and filter group activity, duplicate an entry, undo a delete, nudge friends who owe you with a share-sheet reminder, and use the keyboard shortcuts `n` (new entry) and `/` (search).
*   **Offline-First & PWA:** Built to work entirely offline. Transactions are stored in a local IndexedDB queue and automatically pushed to Google APIs when the network connection is restored.
*   **Receipt Scanning (on-device):** Snap a bill with the camera, pick a photo or screenshot from your gallery, or open a PDF bill (drag-and-drop and paste work on desktop), and SpreadShare fills in the amount, currency, date, shop and category. You can drag the crop corners (with perspective correction) and fix dark or faded photos before reading. PaddleOCR (PP-OCRv6) runs in the browser, and an arithmetic solver checks that items, taxes and the total add up, flagging anything that doesn't. Nothing is sent to a server. The reader (~67 MB) downloads automatically when the app is installed (or on first scan, or from Settings) and is kept on the device, so scanning works offline.
*   **Auto-Categorization (on-device):** As you type a description or scan a receipt, SpreadShare picks the category. A small Naive Bayes model learns from your own past expenses (so "Toit" → Food, or your Instamart runs → Groceries), and built-in keyword rules cover everything else. It never overrides a category you picked yourself.
*   **Stay Organised:** Notes and #tags on entries, comment threads, full edit history, cross-group search, monthly budgets with heads-ups, and per-person monthly statements (text, CSV or PDF).
*   **Payment Messages & Sharing:** Paste a bank SMS, UPI notification or card alert and the amount, payee and date are filled in (balances and limits are ignored). In the installed app, share a receipt image or a payment message from any app straight into SpreadShare.
*   **Item-Wise Splitting:** Scanned receipts default to splitting by items. Assign scanned (or hand-typed) items to people. Tax, service charges and discounts are shared in proportion to each person's items, to the exact cent.
*   **On-Device Image Compression:** Receipt uploads are intercepted, aggressively scaled down, and converted to WebP formats client-side to bypass payload limits and cross-site tracking blocks before uploading to Google Drive.
*   **Personal Analytics:** SVG charts for day-of-the-week spending, category breakdowns, per-group totals and daily trendlines.
*   **Deep Customization:** Light / dark / auto themes, OLED pure-black mode, 12 accent palettes, and global UI scaling.
*   **Accent-Tinted App Icon:** The app icon is a parametric SVG. The in-app logo recolours live, and the favicon, home-screen icon and PWA manifest switch to a matching icon set for the chosen accent.
*   **Installable:** Install prompt in Settings, and the home-screen icon shows a badge with the number of entries waiting to sync (where supported). Long-press the icon for **Add expense** / **Scan receipt** shortcuts, which open in the group you used last.
*   **Updates you control:** New versions download in the background and a banner offers **Update**. Settings shows the version, can check for updates, and can **Reinstall** the app's files from scratch (your data and the receipt reader are kept).
*   **Fast & native-feeling:** The app opens straight to your local data, with pull-to-refresh on phones, smooth screen transitions, haptic taps, and recent descriptions suggested as you type.

## Technical Stack

*   **Frontend:** Svelte 5 (runes), Vite, Tailwind CSS v4
*   **Authentication:** Google Identity Services (GSI) / OAuth 2.0 token model
*   **Database / Storage:** Google Sheets API v4, Google Drive API v3
*   **Local Caching:** IndexedDB (events cache + outbound queue), LocalStorage (profile, preferences)
*   **Visualization:** Inline SVG

## System Architecture

SpreadShare operates on a double-entry ledger system. Every action (Expense, Transfer, Loan) is recorded as an immutable event node in a Google Sheet. The application fetches these raw events and reconstructs the group's mathematical state on the client side.

Event types: `MEMBER_JOINED`, `EXPENSE_ADD`, `TRANSFER`, `LOAN`, `EXPENSE_DELETE` and `COMMENT`. An edit is an `EXPENSE_DELETE` of the old entry plus a new entry with `replaces: <old id>`, which links versions for the history view. Comments are `COMMENT` events pointing at an entry. Clients ignore event types they don't know, so older versions of the app keep working with newer sheets.

1.  **Authentication:** The user logs in via Google. The app requests scopes exclusively for Sheets and Drive files created by the application itself.
2.  **Provisioning:** Upon creating a new group, the app provisions a hidden configuration file in Drive and a new Spreadsheet formatted to accept ledger entries.
3.  **Synchronization:** The app pulls the ledger data, caches it locally in IndexedDB, and computes balances. Any new transaction is written locally first for zero-latency UI updates, then queued for background sync.

## Roadmap

Everything here keeps SpreadShare's rules: no server, data stays in your own Google Drive, and anything smart runs on your device.

### Done
- [x] **Receipt Auto-Parsing:** On-device OCR extracts totals, dates, merchant names, items and taxes from photos, screenshots and gallery images (camera, gallery, drag-and-drop or paste).
- [x] **Item-Wise Bill Splitting:** Assign line items from a scanned receipt to specific members instead of splitting the grand total.
- [x] **Smart Auto-Categorization:** Predicts the category from the title, scanned shop and item names, using a model trained on your own past expenses with keyword rules as a fallback.
- [x] **Offline receipt reader:** Downloaded on install and kept on the device, so scanning works without a connection.
- [x] **Share to SpreadShare:** Share a receipt photo or screenshot, or a payment message, from Gallery, WhatsApp, Messages or a delivery app straight into a new expense (installed app, Web Share Target).
- [x] **Paste a payment message:** Bank SMS, UPI notifications and payment emails ("Rs 450.00 debited … to SWIGGY on 01-10-26") become an expense with amount, merchant and date filled in.
- [x] **PDF bills & e-invoices:** Food delivery, shopping, cab and airline PDFs read on device with pdf.js, from the picker, drag-and-drop or Share to SpreadShare. Text-based PDFs skip OCR entirely, so the numbers are exact; scanned PDFs go through the scanner.

### Import from anywhere
- [ ] **Bank & card statements:** Import CSV / XLSX / OFX (PDF later), tick the transactions to add, auto-categorised, with duplicates flagged by amount and date.
- [ ] **Switch from Splitwise, Tricount or Settle Up:** Import their CSV exports, match names to group members, and carry balances over.
- [ ] **Existing spreadsheets:** Map the columns of a Google Sheet you already use for expenses and import its rows.
- [ ] **Batch scan:** Pick several receipts at once; each becomes a draft to review and save.

### Faster everyday use
- [x] **Home-screen shortcuts:** Long-press the app icon for "Add expense" or "Scan receipt", opening in the group you used last.
- [ ] **Recurring expenses:** Rent, subscriptions, house help. A pre-filled entry appears each period, created on device when the app opens.
- [ ] **Pay with UPI:** "Record payment" can open your UPI app with the payee and amount filled in (members add their UPI ID once), then records the payment when you return.
- [ ] **Members without Google accounts:** Add people by name (family, a friend who won't sign in) and merge them into their account if they join later.
- [ ] **Voice entry:** "Paid 600 for dinner with Asha and Ravi", understood on device.
- [ ] **Split presets:** Save splits you use often, like "me + Asha 60/40", per group.
- [ ] **Trip currency:** A default currency per group for trips abroad, with totals shown at the trip's rate.

### Stay organised
- [x] **Budgets:** Monthly limits per category (and overall) on your share, with progress and pacing in Insights and a heads-up when you save something that gets close. Saved to your Drive.
- [x] **Notes, comments & history:** Notes on any entry, a comment thread everyone in the group sees, and a version history with plain-language changes.
- [x] **Monthly statements:** Per person (or everyone) for any month or all time: opening balance, every entry's effect, closing balance. Share as text, CSV, or print / save as PDF.
- [x] **Search everywhere & tags:** Search all groups at once, and tag entries with #goa, #office in a title or note.
- [ ] **Group budgets:** A shared budget for a trip or a flat, visible to everyone in the group.
- [ ] **Reminders for recurring bills:** A nudge when rent or a subscription is due.

### Smarter on-device AI
- [ ] **Learns from your corrections:** When you fix a scanned total or merchant, remember that shop's receipt layout.
- [ ] **Richer category model:** Also use the amount, time of day and group to break ties.
- [ ] **Duplicate detection:** Warn when someone in the group already added the same bill (same amount, date and shop).

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
4. `npm run check` type-checks the Svelte components; `npm test` runs the unit tests (split maths, ledger engine, analytics).
5. CI (`.github/workflows/ci.yml`) runs check, tests and build on every push and pull request.

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
    split.js            split strategies (equal, shares, exact, +/-, items)
    categorize.js       category suggestions: personal Naive Bayes model + keyword rules
    history.js          edit chains (payload.replaces) and COMMENT events
    statement.js        per-person statements (opening → entries → closing)
    budgets.js, prefs.svelte.js   monthly budgets; prefs synced to .spreadshare_prefs.json in Drive
    tags.js             #tags in titles and notes
    receipt/            receipt scanner , see "Receipt parser" below
    auth.js, db.js, math.js, currency.js, ...
build/brand-icons.js    Vite plugin: renders the icon + manifest for every accent in app.css
public/                 service worker (copied as-is)
```

The app icon lives in `src/lib/brandIcon.js`. At build time, `build/brand-icons.js` reads the accent palettes from `src/app.css` and emits `icons/<accent>.svg`, `icons/<accent>-{180,192,512,maskable-512}.png` and `manifest-<accent>.webmanifest`. In dev, it serves the same files. Adding a palette to `app.css` automatically gives it an icon set.

### Receipt parser
`src/lib/receipt/` runs entirely in the browser and is code-split, so it only loads when someone taps **Scan a receipt**:

- `ocr.js`, `preprocess.js`, `solver.js`, `datetime.js`, `schema.js`, `audit.js` are **vendored unchanged** from the receipt_test bench (commit noted in each file header). Improve the parser there, measure it on the bench, then copy the files back.
- `image.js` holds the scanner's photo handling (auto corners, perspective flattening, brightness / contrast).
- `draft.js` maps a parsed receipt onto expense fields (amount, date, merchant, category guess, items).
- `pdf.js` / `pdfText.js` open PDF bills with pdf.js (its own lazily-loaded chunk). Text PDFs have their positioned text turned into OCR-style boxes and go straight to the solver; scanned PDFs are rendered and OCR'd.
- `paddle-lazy.js` stands in for the PaddleOCR CDN import (via an alias in `vite.config.js`) so the ~12 MB of OCR code downloads only when OCR actually runs. Text PDFs and the crop editor work without it, even offline.
- `index.js` is the entry point the UI imports lazily.

PaddleOCR is loaded from jsDelivr (pinned version). The service worker keeps PaddleOCR, OpenCV, the ONNX runtime and both models in a dedicated `spreadshare-ocr-…` cache that survives app updates; `src/lib/ocrOffline.svelte.js` downloads it in the background when the app is installed and powers the Settings row. Bump the cache name in `public/sw.js` and `ocrOffline.svelte.js` together if the PaddleOCR version changes. Unit tests feed synthetic OCR boxes through the real solver (`tests/receipt.test.js`); the CDN import is stubbed in `vitest.config.js`.

### Deploying to GitHub Pages
```bash
npm run deploy
```
This type-checks, runs the tests, builds into `dist/` and publishes it to the `gh-pages` branch (via the `gh-pages` package), with a `.nojekyll` marker. The build uses relative asset paths, so it works under `https://<user>.github.io/SpreadShare/` without extra config.

Every build stamps a unique ID into `sw.js` (`build/build-info.js`). Open apps notice the new version within about half an hour (or straight away from Settings → Check for updates) and show an **Update** banner. Nothing switches over until the user taps it.
