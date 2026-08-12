// Reads the Expenses tab and returns submissions filtered by user.

import { getTab, readRows } from '@/lib/sheets';
import { ADMIN_ROLES } from '@/lib/constants';

const PAGE_SIZE = 20;

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const user = searchParams.get('user');
    const role = searchParams.get('role');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const q = (searchParams.get('q') || '').trim().toLowerCase();
    const amountFilter = (searchParams.get('amount') || '').trim();

    // Filter by ID, not .slice(1): the Expenses tab has a blank row 3 and an "ℹ" note
    // row 4 sitting inside the data, which previously surfaced as two junk entries in
    // every admin's history.
    const rows = await readRows(await getTab('EXPENSES'), 'A:S', /^EXP-/);

    // Admin roles see all; everyone else sees their own only
    const isAdmin = ADMIN_ROLES.includes(role);
    const filtered = isAdmin
      ? rows
      : rows.filter(row => row[11] === user); // col L = submitted_by

    // Apply text search on displayAddress
    let searched = filtered;
    if (q) {
      searched = searched.filter(row => (row[3] || '').toLowerCase().includes(q));
    }

    // Apply amount filter (exact match to 2 dp)
    if (amountFilter) {
      const target = parseFloat(amountFilter);
      if (!isNaN(target)) {
        searched = searched.filter(row => Math.abs(parseFloat(row[6] || 0) - target) < 0.005);
      }
    }

    // Newest first, then paginate
    const reversed = [...searched].reverse();
    const total = reversed.length;
    const paged = reversed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const expenses = paged.map(row => ({
      expenseId:      row[0]  || '',
      date:           row[1]  || '',
      projectCode:    row[2]  || '',
      displayAddress: row[3]  || '',
      category:       row[4]  || '',
      description:    row[5]  || '',
      amount:         row[6]  || '0',
      payeeId:        row[7]  || '',
      payeeName:      row[8]  || '',
      receiptUrls:    row[10] || '',
      submittedBy:    row[11] || '',
      status:         row[12] || 'pending', // admin_status column
      receiptStatus:  row[18] || '',        // col S — blank on rows predating the column
    }));

    return Response.json({ expenses, total, page, pageSize: PAGE_SIZE });

  } catch (err) {
    console.error('History error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
