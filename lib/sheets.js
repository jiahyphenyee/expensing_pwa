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
