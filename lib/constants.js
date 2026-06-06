export const USER_ROLES = {
  ADMIN: 'admin',
  SENIOR_WORKER: 'senior_worker',
};

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

// Xero API constants

export const XERO_ACCOUNT_CODE = '310';

export const XERO_TRACKING_CATEGORY = 'Service';

// Maps PWA category codes to Xero tracking option names
// null = leave untagged
export const CATEGORY_TO_TRACKING = {
  PLMB:  'Plumbing',
  TILE:  'Tiling',
  PAINT: 'Painting',
  ELEC:  'Electrical',
  CARP:  'Carpentry',
  HACK:  'Hacking',
  GENL:  'General',
  MATL:  null,
  WTRP:  null,
  OTHR:  null,
};