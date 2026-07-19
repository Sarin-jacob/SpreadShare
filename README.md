# SpreadShare

**Live Demo:** [https://sarin-jacob.github.io/SpreadShare/](https://sarin-jacob.github.io/SpreadShare/)

A 100% serverless, local-first Progressive Web Application (PWA) for managing group expenses, tracking peer-to-peer debts, and splitting bills. SpreadShare bypasses traditional centralized backends by connecting directly to the user's personal Google Drive and Google Sheets via OAuth 2.0, ensuring absolute data privacy and ownership.

## Key Features

*   **Zero-Backend Architecture:** Ledger data is stored as a raw data sequence in Google Sheets. Configuration and receipt images are stored in Google Drive. 
*   **Advanced Split Engine:** Supports splitting equally, by custom weight shares, by exact amounts, or by relative adjustments (+/-). Inputs support inline mathematical evaluation.
*   **Optimized Settlements:** Utilizes a greedy algorithm to calculate the most efficient path to settle complex group debts, minimizing the total number of required transactions.
*   **Offline-First & PWA:** Built to work entirely offline. Transactions are stored in a local IndexedDB queue and automatically pushed to Google APIs when the network connection is restored.
*   **On-Device Image Compression:** Receipt uploads are intercepted, aggressively scaled down, and converted to WebP formats client-side to bypass payload limits and cross-site tracking blocks before uploading to Google Drive.
*   **Personal Analytics:** Interactive HTML5 Canvas visualizations providing day-of-the-week spending velocity, category breakdowns, and historical trendlines.
*   **Deep Customization:** Built-in settings for Dark mode, OLED pure-black mode, 12 dynamic accent palettes, and global UI scaling.

## Technical Stack

*   **Frontend:** Vanilla JavaScript (ES6 Modules), HTML5, Tailwind CSS
*   **Authentication:** Google Identity Services (GSI) / OAuth 2.0 with background silent token refreshing
*   **Database / Storage:** Google Sheets API v4, Google Drive API v3
*   **Local Caching:** IndexedDB (via custom wrapper), LocalStorage API
*   **Visualization:** Native HTML5 Canvas API

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

### Installation
1. Clone the repository to your local machine.
2. Navigate to the `src/js/config.js` file (create one if it does not exist) and add your Google OAuth Client ID.
3. Serve the directory using any static file server. Note: Google Identity Services requires the app to be served over `http://localhost` or a secure `https://` domain.