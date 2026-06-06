// Reads the Expenses tab and returns submissions filtered by user.

import { getGoogleAuth } from '@/lib/google';
import { google } from 'googleapis';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const user = searchParams.get('user');
    const role = searchParams.get('role');

    const auth = await getGoogleAuth().getClient();
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Expenses!A:R',
    });

    const rows = (res.data.values || []).slice(1); // skip header

    // Admin sees all, senior worker sees own only
    const filtered = role === 'admin'
      ? rows
      : rows.filter(row => row[11] === user); // col L = submitted_by

    // Map to objects, newest first
    const expenses = filtered
      .reverse()
      .map(row => ({
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
      }));

    return Response.json({ expenses });

  } catch (err) {
    console.error('History error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}