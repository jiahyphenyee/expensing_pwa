// Non-receipted project costs — the "Project costs" tab.
//
// That tab is owned by the sibling projects-pwa (its lib/costs.js is the fuller
// implementation: read, edit, delete, invoice flags). This app only ever appends to it,
// for the extra items added to an expense claim, so only the write path is ported here.
//
// The tab is NOT linked to Xero. Extra items are also pushed to the Xero bill as line
// items by lib/xero.js, so an extra item deliberately lands in both places — the Xero
// bill for the payable, this tab for project cost reporting.

import {
  getTab, readRows, range, getSheetsClient,
  assertHeaders, safe, nextId, writeRowsAfterLast,
} from '@/lib/sheets';
import { EXTRA_ITEM_COST_TYPE, EXTRA_ITEM_FALLBACK_CATEGORY } from '@/lib/constants';

const COST_ID       = /^PC-/;
const CATEGORY_CODE = /^[A-Z]{3,6}$/;

// Project costs column order (A:N), paired with the header each position must carry.
//
// One list, two derived views: the indices the code writes by, and the headers the sheet
// is checked against on first use. They cannot drift apart, which is the point.
//
// The tab is exactly 14 columns wide and every range must stay inside it: a write past N
// is rejected outright by the API with "exceeds grid limits", not silently truncated.
const COLUMNS = [
  ['id',             'cost_id'],
  ['createdAt',      'created_at'],
  ['projectCode',    'project_code'],
  ['displayAddress', 'display_address'],
  ['costDate',       'cost_date'],
  ['costType',       'cost_type'],
  ['categoryCode',   'category_code'],
  ['description',    'description'],
  ['amount',         'amount'],
  ['invoiced',       'invoiced'],
  ['invoicedDate',   'invoiced_date'],
  ['invoiceRef',     'invoice_ref'],
  ['createdBy',      'created_by'],
  ['updatedAt',      'updated_at'],
];

const HEADERS = COLUMNS.map(([, header]) => header);

/** The Project costs tab, with its column layout verified once per process. */
async function projectCostsTab() {
  const tab = await getTab('PROJECT_COSTS');
  await assertHeaders(tab, HEADERS);
  return tab;
}

/** Now, as an ISO timestamp in Singapore time — the workbook's timezone. */
function nowIsoSingapore() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());

  const get = type => parts.find(p => p.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+08:00`;
}

/** True for a well-formed YYYY-MM-DD that is also a real calendar date. */
function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** The set of category codes still marked active (Categories column C). */
async function activeCategoryCodes() {
  const tab  = await getTab('CATEGORIES');
  const rows = await readRows(tab, 'A:C', CATEGORY_CODE);
  return new Set(
    rows
      .filter(row => String(row[2] || '').toUpperCase() === 'TRUE')
      .map(row => String(row[0]).trim())
  );
}

/**
 * Amounts arrive from the form as strings. Returns null, never 0, for anything that is
 * not a number: a zero is a real and plausible amount, so coercing garbage to it makes
 * bad input look like sound data.
 */
function parseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const n = parseFloat(text.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Append one Project costs row per extra item on an expense claim.
 *
 * Every item is booked as EXTRA_ITEM_COST_TYPE (transport) — the form offers no per-item
 * type control. The category is inherited from the expense so cost reporting keeps the
 * trade the worker chose ("transport" against "Electrical" is an established shape in
 * this tab), falling back to Worker Transport when the optional Category field was left
 * blank or names a category since deactivated.
 *
 * Items that are blank or non-positive are skipped rather than rejected: the form seeds a
 * new row with placeholder text, so a half-filled one is a normal thing to submit past.
 *
 * Returns { written, skipped, ids }. Throws only on a genuine Sheets failure — the caller
 * is expected to swallow that so a costs problem can never lose the expense itself.
 */
export async function createCostsForExtraItems({
  extraItems, projectCode, projectAddress, date, categoryCode, submittedBy,
}) {
  const code = String(projectCode || '').trim();
  if (!code) return { written: 0, skipped: (extraItems || []).length, ids: [] };

  const costDate = isIsoDate(date) ? date : nowIsoSingapore().slice(0, 10);

  const candidates = (extraItems || [])
    .map(item => ({
      description: String(item?.description ?? '').trim(),
      amount:      parseAmount(item?.amount),
    }))
    // An amount over a million is a mistyped figure, not a cost. Matched to the same
    // guard the projects-pwa applies on its own cost form.
    .filter(item =>
      item.description &&
      item.amount !== null &&
      item.amount > 0 &&
      item.amount <= 1_000_000
    );

  const skipped = (extraItems || []).length - candidates.length;
  if (!candidates.length) return { written: 0, skipped, ids: [] };

  const [tab, active] = await Promise.all([projectCostsTab(), activeCategoryCodes()]);

  const wanted  = String(categoryCode || '').trim();
  const category = active.has(wanted) ? wanted : EXTRA_ITEM_FALLBACK_CATEGORY;

  // One read of column A for the whole batch, so a claim with three extra items gets
  // three consecutive ids rather than three racing max+1 lookups.
  const existing = await readRows(tab, 'A:A', COST_ID);
  const maxId    = existing.map(row => row[0]);
  const now      = nowIsoSingapore();

  // nextId is max+1 over the ids it is given, so calling it per item would hand every row
  // the same id. Take the base number once, then count up from it.
  const base = parseInt(nextId(maxId, 'PC-', 4).slice(3), 10);
  const values = candidates.map((item, i) => ([
    `PC-${String(base + i).padStart(4, '0')}`, // A cost_id
    now,                                       // B created_at
    safe(code),                                // C project_code
    safe(projectAddress || ''),                // D display_address — snapshot at entry
    costDate,                                  // E cost_date
    EXTRA_ITEM_COST_TYPE,                      // F cost_type
    category,                                  // G category_code
    safe(item.description),                    // H description
    item.amount,                               // I amount
    'FALSE',                                   // J invoiced
    '',                                        // K invoiced_date
    '',                                        // L invoice_ref
    safe(submittedBy || ''),                   // M created_by
    now,                                       // N updated_at
  ]));

  const startRow = await writeRowsAfterLast(tab, COST_ID, values);

  // Row selection is not atomic, so confirm the rows that landed are ours before
  // reporting them written.
  const ids = values.map(row => row[0]);
  const sheets = await getSheetsClient();
  const check = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: range(tab, `A${startRow}:A${startRow + values.length - 1}`),
  });
  const landed = (check.data.values || []).map(r => String(r[0] ?? '').trim());
  if (ids.some((id, i) => landed[i] !== id)) {
    throw new Error('Another entry was saved at the same moment — project costs may be duplicated');
  }

  return { written: values.length, skipped, ids };
}
