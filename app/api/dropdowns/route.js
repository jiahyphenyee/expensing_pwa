// Fetches dropdown lists in 1 call when expense form loads

import { getTab, readRows } from '@/lib/sheets';

// Rows are selected by ID prefix rather than by slicing off a header: this workbook has
// free-text "ℹ" note rows sitting inside the data ranges (Projects row 2, Contacts row 5),
// so .slice(1) lets them through.
const PROJECT_ID  = /^(PRJ-|GEN-)/;
const CONTACT_ID  = /^CON-/;
const WORKER_ID   = /^WRK-/;
// Categories have no ID prefix — column A is the code itself
const CATEGORY_ID = /^[A-Z]{3,6}$/;

export async function GET() {
  try {
    const [projectsTab, contactsTab, workersTab, categoriesTab] = await Promise.all([
      getTab('PROJECTS'),
      getTab('CONTACTS'),
      getTab('WORKERS'),
      getTab('CATEGORIES'),
    ]);

    const [projects, contacts, workers, categories] = await Promise.all([
      readRows(projectsTab,   'A:H', PROJECT_ID),
      readRows(contactsTab,   'A:F', CONTACT_ID),
      readRows(workersTab,    'A:J', WORKER_ID),
      readRows(categoriesTab, 'A:C', CATEGORY_ID),
    ]);

    // Active projects only (status column H = "active")
    const activeProjects = projects
      .filter(row => row[7] === 'active')
      .map(row => ({ code: row[0], address: row[1] }));

    // Contacts where type contains supplier or subcontractor
    const supplierContacts = contacts
      .filter(row => row[5] && (row[5].includes('supplier') || row[5].includes('subcontractor')))
      .map(row => ({
        id:          row[0],
        name:        row[2],                                    // contact person name only
        displayName: row[1] ? `${row[2]} (${row[1]})` : row[2], // "Ahmad (ABC Hardware)"
        type:        'contact',
      }));

    // Active workers
    const activeWorkers = workers
      .filter(row => row[9] === 'active')
      .map(row => ({
        id:          row[0],
        name:        row[1],               // clean name only e.g. "Ahmad"
        displayName: `${row[1]} (Worker)`, // (Worker) shown in dropdown only
        type:        'worker',
      }));

    // Merge and sort payees alphabetically
    const payees = [...supplierContacts, ...activeWorkers]
      .sort((a, b) => a.name.localeCompare(b.name));

    // Active categories only — column C is headed active_codes and holds "TRUE"
    const activeCategories = categories
      .filter(row => String(row[2] || '').toUpperCase() === 'TRUE')
      .map(row => ({ code: row[0], name: row[1] }));

    return Response.json({ activeProjects, payees, activeCategories });

  } catch (err) {
    console.error('Dropdowns error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
