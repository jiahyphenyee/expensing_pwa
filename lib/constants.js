// Session constants
//
// Kept in step with the sibling projects-pwa, which uses the same PIN list from the
// System config tab. Bump SESSION_TTL_DAYS to keep workers signed in for longer.
export const SESSION_KEY      = 'expense_pwa_user';
export const SESSION_TTL_DAYS = 7;

export const USER_ROLES = {
  ADMIN: 'admin',
  SENIOR_WORKER: 'senior_worker',
};

// Roles that see all submissions in history (not just their own)
export const ADMIN_ROLES = ['admin', 'boss_man'];

// Project-related constants

export const GENERAL_PROJECT = {
  code: 'GEN-000',
  address: 'General / No project',
};

export const UNLINKED_PROJECT = {
  code: 'UNLINKED',
  address: '',
};

// Expense-related constants

export const DEFAULT_PAYEE = {
  id:          'WRK-001',        
  name:        'Wang Wei Liang',            // clean name sent to Xero + Sheets e.g. 'ABC Hardware'
  type:        'worker',                    // 'contact' or 'worker'
  displayName: 'Wang Wei Liang (Worker)',   // shown in dropdown
};

export const ADMIN_STATUSES = {
  PENDING:  'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

export const XERO_SYNC_STATUSES = {
  SYNCED: 'synced',
  ERROR:  'error',
};

// Expenses column S. Distinguishes "the worker says no receipt exists" from
// "nothing attached yet" — column K (receipt_urls) is written as '' on every row
// and never backfilled, so it can't carry that. Blank = row predates this column.
export const RECEIPT_STATUSES = {
  ATTACHED:      'attached',
  DECLARED_NONE: 'declared_none',
};

// Xero API constants

export const XERO_ACCOUNT_CODE = '310';

// Categories whose spend belongs on an account other than the default. Keyed by the
// category code in the Categories tab's column A; anything not listed here falls back
// to XERO_ACCOUNT_CODE. Applies to every line on the bill, extra items included — the
// category is chosen once for the whole claim.
export const CATEGORY_TO_ACCOUNT_CODE = {
  VEHIC: '449',   // Motor Vehicle Expenses
};

export const XERO_TRACKING_CATEGORY = 'Service';

// The category → Xero "Service" option mapping used to live here as CATEGORY_TO_TRACKING.
// Since 2026-10-06 it is the Categories tab's `xero_tracking_option` column (E), read by
// lib/xero.js, so this app and projects-pwa share one list. Edit the sheet, not code.
// A blank cell means "post untagged" (OTHR, by design). Xero's "Plastering" option has
// no category row; add one with the option name in column E if that work gets tracked.

// ── Project costs (non-receipted) ────────────────────────────────────────────

// The four values in the Project costs tab's column F dropdown. Kept in step with the
// sibling projects-pwa, which owns that tab — a value outside this list is rejected by
// the sheet's data validation, so never widen it here alone.
export const COST_TYPES = [
  { value: 'material',          label: 'Material'        },
  { value: 'labour (internal)', label: 'Internal Labour' },
  { value: 'labour (external)', label: 'External Labour' },
  { value: 'transport',         label: 'Transport'       },
];

export const COST_TYPE_VALUES = COST_TYPES.map(t => t.value);

// Expenses column T (`cost_type`): what a receipted claim paid for, chosen on the form.
// The same vocabulary as Project costs column F — column T carries the same dropdown —
// so projects-pwa splits a job's cost by one set of words across both tabs. Internal
// labour is never paid through a claim, so it is not offered. "Subcontractor" is the
// label for `labour (external)`: that is how the workers name it. Blank = row predates
// the column.
export const RECEIPTED_COST_TYPES = [
  { value: 'material',          label: 'Material'      },
  { value: 'labour (external)', label: 'Subcontractor' },
  { value: 'transport',         label: 'Transport'     },
];

export const RECEIPTED_COST_TYPE_VALUES = RECEIPTED_COST_TYPES.map(t => t.value);

export const DEFAULT_RECEIPTED_COST_TYPE = 'material';

// Extra items on an expense claim are overwhelmingly the worker's own transport, so
// every extra item is booked as a transport cost. There is no per-item type control on
// the form — change this only alongside one.
export const EXTRA_ITEM_COST_TYPE = 'transport';

// Project costs requires a category code, but the expense form's Category field is
// optional. Falls back to Worker Transport, which is what an untagged extra item is.
export const EXTRA_ITEM_FALLBACK_CATEGORY = 'TRANS';

// Stamped into the Project costs created_by column, ahead of the submitter's name, as
// "Expense PWA, JY". Marks the rows this app wrote — which are the ones that also exist
// in Xero — apart from those entered directly in the sibling projects-pwa, which carry a
// bare name and never reach Xero. Matches the provenance already in that column on the
// bulk-loaded rows ("Xero import").
export const COST_SOURCE_LABEL = 'Expense PWA';

/** "Expense PWA, JY", or just "Expense PWA" when the submitter is unknown. */
export function costCreatedBy(submittedBy) {
  const name = String(submittedBy || '').trim();
  return name ? `${COST_SOURCE_LABEL}, ${name}` : COST_SOURCE_LABEL;
}
