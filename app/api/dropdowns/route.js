// Fetches dropdown lists in 1 call when expense form loads 

import { getGoogleAuth } from '@/lib/google';
import { google } from 'googleapis';

export async function GET() {
  try {
    const auth = await getGoogleAuth().getClient();
    const sheets = google.sheets({ version: 'v4', auth });
    const sheetId = process.env.GOOGLE_SHEET_ID;

    const [projects, contacts, workers, categories] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Projects!A:H' }),
      sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Contacts!A:F' }),
      sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Workers!A:J' }),
      sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Categories!A:C' }),
    ]);

    // Active projects only (status column H = "active")
    const activeProjects = (projects.data.values || [])
      .slice(1)
      .filter(row => row[7] === 'active')
      .map(row => ({ code: row[0], address: row[1] }));

    // Contacts where type contains supplier or subcontractor
    const supplierContacts = (contacts.data.values || [])
      .slice(1)
      .filter(row => row[5] && (row[5].includes('supplier') || row[5].includes('subcontractor')))
      .map(row => ({
        id:          row[0],
        name:        row[2],                                    // contact person name only
        displayName: row[1] ? `${row[2]} (${row[1]})` : row[2], // "Ahmad (ABC Hardware)"
        type:        'contact',
      }));

    // Active workers
    const activeWorkers = (workers.data.values || [])
      .slice(1)
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

    // Active categories only
    const activeCategories = (categories.data.values || [])
      .slice(1)
      .filter(row => row[2] === 'TRUE' || row[2] === true)
      .map(row => ({ code: row[0], name: row[1] }));

    return Response.json({ activeProjects, payees, activeCategories });

  } catch (err) {
    console.error('Dropdowns error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}