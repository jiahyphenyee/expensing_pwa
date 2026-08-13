# Changelog

Single source of truth for incremental updates. After every code change,
append a 1–2 line entry under **Unreleased**. Keep entries short — no
rationale or code excerpts (that belongs in `architecture-decisions.md` if
it's a real design decision). When a batch of Unreleased entries is
deployed/released, retitle the section with a date and start a fresh
Unreleased section above it.

## Unreleased

- Favicon replaced with the app icon (was still the Next.js default).
- Opening a searchable dropdown (category, project address, payee) now focuses the
  search box and raises the keyboard.
- Login is remembered for 7 days in localStorage instead of dying with the browser
  session, matching projects-pwa. Everyone re-enters their PIN once after this ships.
- Receipts are no longer compulsory: workers can tick "I don't have a receipt"
  to submit without one, recorded in the new Expenses column S (`receipt_status`)
  and flagged in history.
- Receipt photos are now downscaled before upload, so a large phone photo no
  longer fails silently against the 4.5 MB request limit. Oversized PDFs, which
  can't be downscaled, are rejected at the file picker with a reason.

## 2026-07-23

- Extra Amount field now has the same focus-clear × button as line-item amounts.
- Claim form supports repeatable extra expense line items (description + amount).
- Xero draft bill creation now includes extra line items as additional invoice lines.

## 2026-07-19

- Default line items now use "No Tax" instead of a tax rate.

## 2026-07-17

- Submission field order reworked for the claim form.
- Expense categories mapped to Xero tracking category options.

## 2026-07-02

- Receipt PDF preview added (pdfjs-dist), with several rounds of fixes for
  scaling, mobile zoom, and a console deprecation warning.
- Receipt image previews added before submission.
- Expense IDs now include a timestamp suffix to avoid collisions.
- History page: added description column, plus search by amount and address.
- Fixed iOS autofocus causing layout resize, and Sheets formula-injection
  on user-entered text.

## 2026-06-06

- Initial working version: PIN login, claim submission, Sheets + Xero wiring.
- Fixed deployment issues, iOS share/receipt-attachment bug, ESLint errors.
- Added app icon, home button, default payee, and form reset after submit.
- `.env.local` added to `.gitignore`.

## 2026-06-04

- Project bootstrapped with `create-next-app`.
