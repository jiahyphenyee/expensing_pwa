// Writes the new expense row to the Expenses tab.

import { getGoogleAuth } from '@/lib/google';
import { google } from 'googleapis';
import { createXeroBill } from '@/lib/xero';

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      date, projectCode, projectAddress,
      amount, payeeId, payeeName, payeeType,
      category, description, submittedBy,
    } = body;

    const auth    = await getGoogleAuth().getClient();
    const sheets  = google.sheets({ version: 'v4', auth });
    const sheetId = process.env.GOOGLE_SHEET_ID;

    // ── 1. Generate expense ID ──────────────────────────────────────────────
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Expenses!A:A',
    });
    const rowCount  = (existing.data.values || []).length;
    const expenseId = `EXP-${String(rowCount).padStart(3, '0')}`;

    // ── 2. Get category name ────────────────────────────────────────────────
    const categoriesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Categories!A:B',
    });
    const categoryRow  = (categoriesRes.data.values || [])
      .find(r => r[0] === category);
    const categoryName = categoryRow ? categoryRow[1] : category || 'General';

    // ── 3. Create Xero draft bill ───────────────────────────────────────────
    let xeroBillId = '';
    let xeroStatus = '';

    try {
      xeroBillId = await createXeroBill({
        expenseId,
        date,
        payeeName,
        amount,
        description,
        projectCode,
        categoryCode: category,
        categoryName,
      });
      xeroStatus = 'synced';
    } catch (xeroErr) {
      console.error('Xero error:', xeroErr.message);
      xeroStatus = 'error';
    }

    // ── 4. Write row to Sheets ──────────────────────────────────────────────
    const newRow = [
      expenseId,
      date,
      projectCode,
      projectAddress,
      category    || '',
      description || '',
      amount,
      payeeId     || '',
      payeeName,
      payeeType   || '',
      '',               // receipt_urls — filled after attachments
      submittedBy,
      'pending',        // admin_status
      '',               // approved_by
      '',               // approved_date
      xeroBillId,
      xeroStatus,
      xeroStatus === 'error' ? 'Xero push failed on submission' : '',
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Expenses!A:R',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [newRow] },
    });

    return Response.json({ success: true, expenseId, xeroBillId });

  } catch (err) {
    console.error('Submit error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}