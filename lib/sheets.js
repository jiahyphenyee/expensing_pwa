// Tab-name resolution and shared Sheets helpers.
//
// Tab names come from the workbook's "System config" tab (TAB_* keys) rather than being
// hardcoded, so renaming a tab is a config edit instead of a code change and redeploy.

import { getGoogleAuth } from '@/lib/google';
import { google } from 'googleapis';

const CONFIG_TAB    = 'System config';
const CONFIG_TTL_MS = 5 * 60 * 1000;

// Used when the config read fails or a key is missing, so the app degrades instead of
// 500ing. Keep in sync with the TAB_* keys in System config.
const TAB_FALLBACKS = {
  EXPENSES:   'Receipted expenses',
  PROJECTS:   'Projects',
  CONTACTS:   'Contacts',
  WORKERS:    'Workers',
  CATEGORIES: 'Categories',
};

let clientPromise = null;

export async function getSheetsClient() {
  if (!clientPromise) {
    clientPromise = getGoogleAuth()
      .getClient()
      .then(auth => google.sheets({ version: 'v4', auth }))
      .catch(err => { clientPromise = null; throw err; });
  }
  return clientPromise;
}

/**
 * Quote a tab name for an A1 range. Names containing spaces MUST be quoted —
 * 'Receipted expenses'!A:R is valid, Receipted expenses!A:R is a 400. This is the thing
 * that breaks when a tab is renamed to something with a space in it.
 */
export function quoteTab(tabName) {
  return `'${String(tabName).replace(/'/g, "''")}'`;
}

/** Build a full A1 range: range('Expenses', 'A:R') -> "'Expenses'!A:R" */
export function range(tabName, a1) {
  return `${quoteTab(tabName)}!${a1}`;
}

let configCache = null;      // { map, fetchedAt }
let configInFlight = null;

async function getConfigMap() {
  const fresh = configCache && Date.now() - configCache.fetchedAt < CONFIG_TTL_MS;
  if (fresh) return configCache.map;
  if (configInFlight) return configInFlight;

  configInFlight = (async () => {
    try {
      const sheets = await getSheetsClient();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: range(CONFIG_TAB, 'A:B'),
      });
      const map = Object.fromEntries(
        (res.data.values || [])
          .filter(r => r[0] && String(r[0]).trim())
          .map(r => [String(r[0]).trim(), r[1] ?? ''])
      );
      configCache = { map, fetchedAt: Date.now() };
      return map;
    } catch (err) {
      console.warn('[sheets] System config unreadable, using fallbacks:', err.message);
      return configCache?.map ?? {};
    } finally {
      configInFlight = null;
    }
  })();

  return configInFlight;
}

/**
 * Resolve a tab name from its TAB_* config key.
 * getTab('EXPENSES') -> value of TAB_EXPENSES
 */
export async function getTab(key) {
  const map = await getConfigMap();
  const value = map[`TAB_${key}`];
  if (value && String(value).trim()) return String(value).trim();

  const fallback = TAB_FALLBACKS[key];
  if (!fallback) throw new Error(`Unknown tab key: TAB_${key}`);
  console.warn(`[sheets] TAB_${key} missing from System config, falling back to "${fallback}"`);
  return fallback;
}

/**
 * Read a tab and return only real data rows.
 *
 * This workbook has free-text "ℹ" note rows sitting INSIDE data ranges — Projects row 2,
 * Expenses row 4 — so slicing off a header is not enough. Filter on a recognisable ID in
 * the first column instead.
 */
export async function readRows(tabName, a1, idPattern) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: range(tabName, a1),
  });
  return (res.data.values || []).filter(row => idPattern.test(String(row[0] ?? '').trim()));
}

/**
 * Prevent user text being interpreted as a formula. Sheets treats a leading
 * = + - @ | as the start of an expression under USER_ENTERED.
 */
export function safe(value) {
  if (typeof value === 'string' && /^[=+\-@|]/.test(value)) return `'${value}`;
  return value ?? '';
}

/**
 * 0-based column index to an A1 column letter: 0 -> A, 25 -> Z, 26 -> AA.
 *
 * Not String.fromCharCode(65 + i): that returns '[' for column 26 and keeps going into
 * punctuation, producing a range the API rejects for a reason unrelated to the mistake.
 */
export function columnLetter(index) {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * Next sequential ID for a prefix, using max+1 over existing IDs rather than a row count —
 * safe against deleted rows and note rows. nextId([...], 'PC-', 4) -> 'PC-0007'
 */
export function nextId(existingIds, prefix, padding) {
  const max = existingIds.reduce((acc, id) => {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(String(id).trim());
    return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
  }, 0);
  return `${prefix}${String(max + 1).padStart(padding, '0')}`;
}

/**
 * A tab's gid and width, memoised for the life of the process.
 *
 * Width is only used to reject a too-wide write, so a stale value fails closed: widening
 * a tab mid-process makes the next insert complain until the lambda recycles, which is
 * the harmless direction. A narrowed tab is caught immediately, which is the one that
 * matters.
 */
const propsCache = new Map();

async function getSheetProps(tabName) {
  if (propsCache.has(tabName)) return propsCache.get(tabName);
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    fields: 'sheets.properties(sheetId,title,gridProperties.columnCount)',
  });
  const found = meta.data.sheets.find(s => s.properties.title === tabName);
  if (!found) throw new Error(`Tab not found: ${tabName}`);

  const props = {
    gid:         found.properties.sheetId,
    columnCount: found.properties.gridProperties?.columnCount ?? Infinity,
  };
  propsCache.set(tabName, props);
  return props;
}

/** How many columns the tab actually has. A write past the last one is a hard API error. */
export async function getSheetColumnCount(tabName) {
  return (await getSheetProps(tabName)).columnCount;
}

/**
 * Verify a tab's header row still matches the column map the caller reads it with.
 *
 * Inserting or deleting a column shifts every field after it, and code addressing columns
 * by index carries on reading the neighbour's values as though nothing happened — an
 * amount lands in the description, a checkbox parses as a number, and nothing throws. A
 * wrong figure is worse than an error, so this turns that drift into a loud one.
 *
 * `expected` is position-indexed; a `null` entry means "this app does not address that
 * column, so its name is not our business". Columns beyond the array are ignored.
 *
 * Memoised per process, keyed on the expectation as well as the tab. Keying on the tab
 * alone would let the first caller's map satisfy the check for every later one, so a
 * second module reading the same tab through a different, wrong map would sail past
 * unverified — the exact failure this exists to catch. A failed read is not cached, so a
 * transient error cannot wedge the tab permanently.
 */
const headerChecks = new Map();

export function assertHeaders(tabName, expected) {
  const key = `${tabName}|${expected.join(',')}`;
  if (!headerChecks.has(key)) {
    headerChecks.set(key, verifyHeaders(tabName, expected).catch(err => {
      headerChecks.delete(key);
      throw err;
    }));
  }
  return headerChecks.get(key);
}

async function verifyHeaders(tabName, expected) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: range(tabName, `A1:${columnLetter(expected.length - 1)}1`),
  });
  const actual = (res.data.values || [])[0] || [];

  const norm = v => String(v ?? '').trim().toLowerCase();
  const drift = expected
    .map((want, i) => ({ col: columnLetter(i), want, got: actual[i] }))
    .filter(({ want, got }) => want !== null && norm(want) !== norm(got));

  if (!drift.length) return;

  throw new Error(
    `${tabName} no longer has the columns this code expects — ` +
    drift.map(({ col, want, got }) => `${col} should be "${want}" but is "${got ?? '(empty)'}"`).join('; ') +
    `. A column was probably inserted or deleted. Fix the column map in code to match the ` +
    `sheet, rather than reshaping the sheet.`
  );
}

/**
 * Write consecutive rows immediately after the last row whose column A matches
 * `idPattern`. Returns the 1-based sheet row the first one landed on.
 *
 * Used instead of values.append on tabs carrying a checkbox column. A checkbox reports
 * FALSE in every formatted row even when nothing was entered, so the API's table
 * detection treats those rows as occupied and appends BELOW them — landing outside the
 * formatted ranges, where an ISO date stays text instead of becoming a real date.
 * Narrowing the search range does not help: detection looks at whole rows.
 *
 * The trade-off is that row selection is not atomic, so two simultaneous writers could
 * target the same row. Callers must verify the readback. With a handful of users that
 * window is negligible; revisit if this becomes a busy write path.
 */
export async function writeRowsAfterLast(tabName, idPattern, rows, { firstDataRow = 3 } = {}) {
  if (!rows.length) return null;

  // A row wider than the tab means the caller's column map has drifted from the sheet,
  // and the API's own error for it ("exceeds grid limits") names neither. Say which,
  // here, before spending a write on it.
  const columnCount = await getSheetColumnCount(tabName);
  const widest = Math.max(...rows.map(r => r.length));
  if (widest > columnCount) {
    throw new Error(
      `${tabName} is ${columnCount} columns wide but ${widest} values were given. ` +
      `The column map in the caller is out of date with the sheet.`
    );
  }

  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: range(tabName, 'A:A'),
  });

  let lastDataRow = 0;
  (res.data.values || []).forEach((row, i) => {
    if (idPattern.test(String(row[0] ?? '').trim())) lastDataRow = i + 1;
  });

  const start = Math.max(lastDataRow + 1, firstDataRow);
  const end   = start + rows.length - 1;

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: range(tabName, `A${start}:${columnLetter(widest - 1)}${end}`),
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });

  return start;
}
