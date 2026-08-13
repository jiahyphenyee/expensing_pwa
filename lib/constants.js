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

export const XERO_TRACKING_CATEGORY = 'Service';

// Maps category codes (Categories tab, column A) to Xero tracking option names under
// the "Service" tracking category. null = leave the bill untagged.
//
// Verified against Xero on 2026-08-09. The names must match Xero exactly, and they are
// NOT the same strings as the Categories tab's category_name — CEIL is "Ceiling &
// Partition" in the sheet but "Partition / Ceiling" in Xero. An unmatched name is not
// fatal: getTrackingOption logs a warning and leaves the bill untagged.
export const CATEGORY_TO_TRACKING = {
  PLMB:  'Plumbing',
  TILE:  'Tiling',
  PAINT: 'Painting',
  ELEC:  'Electrical',
  CARP:  'Carpentry',
  HACK:  'Hacking',
  GENL:  'General',
  DISP:  'Disposal',
  CEIL:  'Partition / Ceiling',
  WRKR:  'Worker',
  TRANS: 'Worker Transport',
  CLEAN: 'Cleaning',
  VEHIC: 'Company Vehicle',
  OTHR:  null,          // no matching Xero option, by design
};

// Not mapped, and deliberately so:
//   - Xero has a "Plastering" option with no matching category in the sheet. Add a
//     PLAS row to the Categories tab and map it here if that work gets tracked.
//   - MATL and WTRP were removed: both were dropped from the Categories tab, so the
//     entries could never be reached.