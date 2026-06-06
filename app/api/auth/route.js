import { getGoogleAuth } from '@/lib/google';
import { google } from 'googleapis';

export async function POST(req) {
  const { pin } = await req.json();
  const auth = await getGoogleAuth().getClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'System config!A:B',
  });

  const rows = res.data.values || [];
  // PWA users stored as PWA_USER_1 = "Ahmad|5823|senior_worker"
  const userRows = rows.filter(r => r[0]?.startsWith('PWA_USER'));

  for (const row of userRows) {
    const [name, userPin, role] = (row[1] || '').split('|');
    if (userPin === pin) {
      return Response.json({ user: { name, role } });
    }
  }

  return Response.json({ user: null }, { status: 401 });
}