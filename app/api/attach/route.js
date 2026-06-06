import { attachReceiptToBill } from '@/lib/xero';

export async function POST(req) {
  try {
    const formData   = await req.formData();
    const file       = formData.get('file');
    const xeroBillId = formData.get('xeroBillId');

    if (!file || !xeroBillId) {
      return Response.json(
        { error: 'Missing file or xeroBillId' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const url    = await attachReceiptToBill(
      xeroBillId,
      buffer,
      file.name,
      file.type
    );

    return Response.json({ success: true, url });

  } catch (err) {
    console.error('Attach error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}