# Expense Claims PWA

A mobile-first Progressive Web App that lets field workers and subcontractors
submit expense claims from their phone. Each claim is recorded in a Google
Sheet (the system of record) and pushed to Xero as a draft ACCPAY bill with
the receipt attached, ready for a human to review and approve in Xero.

## Core purpose

- Let workers log in with a 4-digit PIN (no accounts/passwords).
- Capture a claim: project, payee, category, amount, description, optional
  extra line items, and a receipt photo/PDF.
- Compress/preview the receipt on-device, then submit.
- Write the claim to Sheets and create a matching Xero draft bill + attachment.
- Let admins/senior roles browse submission history across all workers.

## Tech stack

- **Next.js 15 (App Router)** + **React 19** — no `pages/` directory.
- **Plain JavaScript** — no TypeScript, no `.tsx`.
- **Inline `style={{}}` objects** for styling (Tailwind is installed but not
  used in app code — legacy from `create-next-app`).
- **Google Sheets** (`googleapis`) as the database — projects, workers,
  contacts, categories, PWA user PINs, and Xero tokens all live in one
  spreadsheet.
- **Xero API** (raw `fetch`, no SDK) — draft bill creation + receipt
  attachment.
- **pdfjs-dist** — in-browser receipt PDF preview.
- **PWA manifest + icons** — installable on a worker's home screen.

## Folder map

```
app/
  page.js               PIN login (root route)
  home/                 landing screen after login
  new/                  main expense submission form (largest screen)
  confirm/              post-submit confirmation screen
  history/              search/browse past submissions
  components/
    PdfViewer.js         client-side PDF receipt preview
  api/
    auth/                POST: check PIN against Sheet, return {name, role}
    dropdowns/           GET: active projects/payees/categories for the form
    submit/              POST: writes the Expenses row + creates Xero draft bill
    attach/              POST: attaches uploaded receipt to a Xero bill
    history/             GET: paginated/filterable submission history

lib/
  google.js              Google service-account auth client
  xero.js                Xero token refresh, contact lookup, bill + attachment creation
  auth.js                PIN-matching helper used by api/auth
  session.js              sessionStorage read/write for the logged-in user
  constants.js           roles, statuses, default payee, category→Xero tracking map

scripts/
  xero-auth.mjs          one-off manual OAuth flow to mint the initial Xero tokens

public/
  manifest.json, icon-*.png, pdf.worker.min.js   PWA + pdf.js worker assets
```

Do not update this file for routine changes — it describes the app's
purpose and shape, not its current state. See `CHANGELOG.md` for that.
