# Architecture Decisions

The "why" behind major logic and product decisions. Update this file only
when a new core decision is made — not for routine feature work or bug
fixes (those go in `CHANGELOG.md`).

## Google Sheets as the database

The business already manages projects, workers, contacts, and categories in
a Google Sheet. Using that Sheet as the app's database means zero migration
cost and lets non-technical staff edit reference data (add a worker, flip a
project to inactive) directly, without touching code or a deploy.

Trade-off accepted: no transactions, no schema enforcement, and routes are
coupled to fixed column positions (see `.ai-context.md`). Acceptable at this
scale (single small business, low request volume).

## PIN-based login instead of real auth

Field workers need to log in fast on a shared or personal phone without
managing accounts/passwords. PINs are stored as rows in the "System config"
tab (`PWA_USER_N = "Name|PIN|role"`) so an admin can add or rotate a user's
PIN by editing a spreadsheet cell — no deploy required.

Trade-off accepted: this is not real authentication (no hashing, no rate
limiting, no per-user secrets rotation flow). Acceptable given a small,
trusted user base of known workers; revisit if the app is ever exposed
beyond that group.

## Xero bills are always created as DRAFT

The PWA is a capture / first-pass tool, not the final approval authority.
Every claim becomes a `DRAFT` `ACCPAY` invoice in Xero so a human always
reviews and approves before anything is posted or paid.

## Submission never blocks on Xero

`app/api/submit/route.js` writes the Expenses row regardless of whether the
Xero draft-bill call succeeds. If Xero is down or rejects the call, the
claim is still recorded with `xero_sync_status = 'error'` for manual retry —
the worker's claim (and the Sheets record of it) must never be lost because
of a transient third-party outage.

## Xero tokens stored in the Sheet, not a secrets manager

Access/refresh tokens are read from and written to the "System config" tab
(`lib/xero.js: getSheetTokens`/`saveSheetTokens`) rather than a database or
secret manager. This keeps a single source of config truth (the Sheet) and
avoids standing up separate infrastructure for one low-frequency refresh
token. `scripts/xero-auth.mjs` is the manual one-off flow used to seed the
initial tokens after a Xero app reconnect.

## Category → Xero tracking category mapping

The PWA's expense categories map onto an existing Xero tracking category
("Service") so job-costing reports in Xero keep working unchanged. Some
categories intentionally have no mapping (e.g. `OTHR`) where no equivalent
tracking option exists — those line items are posted untagged rather than
forced into the wrong bucket.

**Since 2026-10-06 the map lives in the workbook**, as the Categories tab's
`xero_tracking_option` column (E), not in `lib/constants.js`. The quote and
billing feature in projects-pwa needs the same mapping for sales invoices,
and two hard-coded copies had already drifted (this app's copy was missing
`AIRC` → "Aircon", so aircon bills went to Xero untagged). One column, read
by both apps, cannot drift.

## Repeatable extra line items (2026-07-23)

Real claims often bundle multiple purchases under one trip or receipt.
Rather than forcing one category/amount per claim, the form supports
repeatable `{description, amount}` line items that map 1:1 onto additional
`LineItems` on the same Xero draft bill, alongside the main line (see
`createXeroBill` in `lib/xero.js`). All line items share the claim's
project/category tracking option.

## Client-side receipt image compression

`compressImage` in `app/new/page.js` downscales/recompresses receipt photos
before upload. Field workers are often on mobile data on-site; receipts only
need to be legible for approval review, not full camera resolution.

## PDF preview via pdfjs-dist, dynamically imported and externalized

`pdfjs-dist` depends on browser-only APIs (canvas, DOM) and breaks the
Next.js server build if bundled server-side. `PdfViewer` is loaded with
`next/dynamic(..., { ssr: false })`, and `next.config.mjs` externalizes
`pdfjs-dist` from the server webpack build entirely, so it's never even
parsed outside the browser.

## Minimal dependency surface by design

No ORM, no TypeScript, no component library, no state management library.
This is a small, single-purpose internal tool (App Router + plain JS +
`googleapis` + raw Xero REST calls). Keep it that way unless a concrete
requirement forces a new dependency.
