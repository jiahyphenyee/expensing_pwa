// Writes the new expense row to the Expenses tab.

import { getSheetsClient, getTab, range, safe } from '@/lib/sheets';
import { createXeroBill } from '@/lib/xero';
import { createCostsForExtraItems } from '@/lib/costs';
import { RECEIPT_STATUSES, RECEIPTED_COST_TYPE_VALUES } from '@/lib/constants';

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      date, projectCode, projectAddress,
      amount, payeeId, payeeName, payeeType,
      category, description, submittedBy,
      extraLineItems, receiptStatus, costType,
    } = body;

    // Fixed enum, not free text — anything else is discarded rather than written through.
    const receiptStatusValue =
      Object.values(RECEIPT_STATUSES).includes(receiptStatus) ? receiptStatus : '';

    // Same rule: column T validates against its own dropdown, so an invented value would
    // sit outside the sheet's list. Blank is what a form cached before this field sends.
    const costTypeValue =
      RECEIPTED_COST_TYPE_VALUES.includes(costType) ? costType : '';

    const sheets  = await getSheetsClient();
    const sheetId = process.env.GOOGLE_SHEET_ID;

    const [expensesTab, categoriesTab] = await Promise.all([
      getTab('EXPENSES'),
      getTab('CATEGORIES'),
    ]);

    // ── 1. Generate expense ID ──────────────────────────────────────────────
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: range(expensesTab, 'A:A'),
    });
    const rowCount  = (existing.data.values || []).length;
    const expenseId = `EXP-${String(rowCount).padStart(3, '0')}-${Date.now().toString().slice(-4)}`; // e.g. EXP-005-1234

    // ── 2. Get category name ────────────────────────────────────────────────
    const categoriesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: range(categoriesTab, 'A:B'),
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
        extraLineItems,
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
      safe(projectAddress),
      category    || '',
      safe(description || ''),
      amount,
      payeeId     || '',
      safe(payeeName),
      payeeType   || '',
      '',               // receipt_urls — filled after attachments
      submittedBy,
      'pending',        // admin_status
      '',               // approved_by
      '',               // approved_date
      xeroBillId,
      xeroStatus,
      xeroStatus === 'error' ? 'Xero push failed on submission' : '',
      receiptStatusValue, // S — 'attached' | 'declared_none'
      costTypeValue,      // T — 'material' | 'labour (external)' | 'transport'
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: range(expensesTab, 'A:T'),
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [newRow] },
    });

    // ── 5. Write extra items to Project costs ───────────────────────────────
    // Each extra item becomes its own non-receipted project cost row. Deliberately after
    // the expense row is safely written, and swallowed on failure for the same reason
    // Xero is: the claim itself must never be lost to a secondary write. The extra items
    // are already on the Xero bill either way, so a failure here costs project reporting
    // detail, not the money record.
    let costsWritten = 0;
    let costsStatus  = '';

    try {
      const result = await createCostsForExtraItems({
        extraItems:     extraLineItems,
        projectCode,
        projectAddress,
        date,
        categoryCode:   category,
        submittedBy,
      });
      costsWritten = result.written;
      costsStatus  = 'ok';
    } catch (costErr) {
      console.error('Project costs error:', costErr.message);
      costsStatus = 'error';
    }

    return Response.json({ success: true, expenseId, xeroBillId, costsWritten, costsStatus });

  } catch (err) {
    console.error('Submit error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}