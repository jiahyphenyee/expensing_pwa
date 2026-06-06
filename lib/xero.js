import { getGoogleAuth } from './google.js';
import { google } from 'googleapis';
import {
  XERO_ACCOUNT_CODE,
  XERO_TRACKING_CATEGORY,
  CATEGORY_TO_TRACKING,
} from './constants.js';

const TOKEN_URL    = 'https://identity.xero.com/connect/token';
const XERO_API_URL = 'https://api.xero.com/api.xro/2.0';

// ── Token store — reads from and writes to Google Sheet ───────────────────────

async function getSheetTokens() {
  const auth    = await getGoogleAuth().getClient();
  const sheets  = google.sheets({ version: 'v4', auth });
  const res     = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range:         'System config!A:B',
  });

  const rows = res.data.values || [];
  const find = key => rows.find(r => r[0] === key)?.[1] || '';

  return {
    accessToken:  find('XERO_ACCESS_TOKEN'),
    refreshToken: find('XERO_REFRESH_TOKEN'),
    expiry:       parseInt(find('XERO_TOKEN_EXPIRY') || '0'),
  };
}

async function saveSheetTokens(accessToken, refreshToken) {
  const auth   = await getGoogleAuth().getClient();
  const sheets = google.sheets({ version: 'v4', auth });

  // Find the row numbers for each key
  const res  = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range:         'System config!A:B',
  });

  const rows   = res.data.values || [];
  const expiry = Date.now() + (29 * 60 * 1000); // 29 minutes from now

  const updates = [
    { key: 'XERO_ACCESS_TOKEN',  value: accessToken  },
    { key: 'XERO_REFRESH_TOKEN', value: refreshToken },
    { key: 'XERO_TOKEN_EXPIRY',  value: String(expiry) },
  ];

  for (const update of updates) {
    const rowIndex = rows.findIndex(r => r[0] === update.key);
    if (rowIndex === -1) continue;

    const range = `System config!B${rowIndex + 1}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId:     process.env.GOOGLE_SHEET_ID,
      range,
      valueInputOption:  'RAW',
      requestBody:       { values: [[update.value]] },
    });
  }
}

async function refreshAccessToken() {
  const { refreshToken } = await getSheetTokens();
  // console.log('Refresh token (first 20 chars):', refreshToken?.slice(0, 20));

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(
        `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
      ).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const text = await res.text();
  // console.log('Token refresh response status:', res.status);
  // console.log('Token refresh response:', text);

  if (!res.ok) {
    throw new Error(`Xero token refresh failed: ${text}`);
  }

  const data = JSON.parse(text);
  await saveSheetTokens(data.access_token, data.refresh_token || refreshToken);
  return data.access_token;
}

async function getAccessToken() {
  const { accessToken, expiry } = await getSheetTokens();

  // console.log('Token expiry:', expiry);
  // console.log('Current time:', Date.now());
  // console.log('Token expired?', Date.now() > expiry - 120000);
  // console.log('Access token (first 20 chars):', accessToken?.slice(0, 20));

  if (!accessToken || Date.now() > expiry - 120000) {
    return refreshAccessToken();
  }

  return accessToken;
}

// ── Shared fetch wrapper ──────────────────────────────────────────────────────

async function xeroFetch(path, options = {}) {
  const token = await getAccessToken();

  console.log('Calling Xero:', path);

  const res = await fetch(`${XERO_API_URL}${path}`, {
    ...options,
    headers: {
      'Authorization':  `Bearer ${token}`,
      'Xero-Tenant-Id': process.env.XERO_TENANT_ID,
      'Accept':         'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Xero API error ${res.status}: ${err}`);
  }

  return res.json();
}

// ── Find or create a Xero contact ─────────────────────────────────────────────

export async function findOrCreateContact(payeeName) {
  // Use SearchTerm instead of where clause — more reliable
  const search = await xeroFetch(
    `/Contacts?SearchTerm=${encodeURIComponent(payeeName)}&summaryOnly=true`
  );

  // Find exact name match from results
  const exact = search.Contacts?.find(
    c => c.Name.toLowerCase() === payeeName.toLowerCase()
  );

  if (exact) return exact.ContactID;

  // Create new contact
  const created = await xeroFetch('/Contacts', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      Contacts: [{ Name: payeeName }],
    }),
  });

  return created.Contacts[0].ContactID;
}

// ── Get tracking option ───────────────────────────────────────────────────────

let trackingCategoryCache = null;

export async function getTrackingOption(categoryCode) {
  const trackingName = CATEGORY_TO_TRACKING[categoryCode];
  if (!trackingName) return null;

  if (!trackingCategoryCache) {
    const res = await xeroFetch('/TrackingCategories');
    trackingCategoryCache = res.TrackingCategories?.find(
      tc => tc.Name === XERO_TRACKING_CATEGORY
    );
  }

  if (!trackingCategoryCache) {
    console.warn(`Tracking category "${XERO_TRACKING_CATEGORY}" not found in Xero`);
    return null;
  }

  const option = trackingCategoryCache.Options?.find(
    o => o.Name === trackingName
  );

  if (!option) {
    console.warn(`Tracking option "${trackingName}" not found`);
    return null;
  }

  return {
    TrackingCategoryID: trackingCategoryCache.TrackingCategoryID,
    TrackingOptionID:   option.TrackingOptionID,
    Name:               trackingCategoryCache.Name,
    Option:             option.Name,
  };
}

// ── Create draft bill ─────────────────────────────────────────────────────────

export async function createXeroBill({
  expenseId, date, payeeName, amount,
  description, projectCode, categoryCode, categoryName,
}) {
  console.log('Creating Xero bill:', {
    expenseId, date, payeeName, amount,
    projectCode, categoryCode, categoryName,
  });

  const contactId = await findOrCreateContact(payeeName);
  const tracking  = await getTrackingOption(categoryCode);
  const reference = `${categoryName} - ${projectCode} - ${expenseId}`;

  const lineItem = {
    Description: description || reference,
    Quantity:    1,
    UnitAmount:  parseFloat(amount),
    AccountCode: XERO_ACCOUNT_CODE,
    Tracking:    tracking ? [{
      Name:   tracking.Name,
      Option: tracking.Option,
    }] : [],
  };

  const res = await xeroFetch('/Invoices', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      Invoices: [{
        Type:            'ACCPAY',
        Status:          'DRAFT',
        Contact:         { ContactID: contactId },
        Date:            date,
        DueDate:         date,
        InvoiceNumber:   reference,
        LineItems:       [lineItem],
        LineAmountTypes: 'Inclusive',
      }],
    }),
  });
  // console.log('Xero bill created:', JSON.stringify(res.Invoices?.[0], null, 2));
  return res.Invoices[0].InvoiceID;
}

// ── Attach receipt to bill ────────────────────────────────────────────────────

export async function attachReceiptToBill(invoiceId, fileBuffer, fileName, mimeType) {
  const token = await getAccessToken();

  const res = await fetch(
    `${XERO_API_URL}/Invoices/${invoiceId}/Attachments/${encodeURIComponent(fileName)}`,
    {
      method:  'PUT',
      headers: {
        'Authorization':  `Bearer ${token}`,
        'Xero-Tenant-Id': process.env.XERO_TENANT_ID,
        'Content-Type':   mimeType || 'application/octet-stream',
        'Accept':         'application/json', // force JSON response
      },
      body: fileBuffer,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error(`Receipt attachment failed (${res.status}):`, err);
    return null;
  }

  // Xero returns XML by default for attachments even with Accept: application/json
  // Just confirm success by status code — don't parse body
  const text = await res.text();
  console.log('Attachment response status:', res.status);

  // Try to extract URL from response if JSON, otherwise just return success flag
  try {
    const data = JSON.parse(text);
    return data.Attachments?.[0]?.Url || 'attached';
  } catch {
    // Response was XML or empty — attachment still succeeded if status was 200
    return res.ok ? 'attached' : null;
  }
}