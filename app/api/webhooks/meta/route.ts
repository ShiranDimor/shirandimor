import { NextResponse } from 'next/server';
import { processWebhook, verifySignature } from '@/lib/metaAutoReply';

export const maxDuration = 30;

// Webhook של מטא (אינסטגרם + עמוד הפייסבוק) למענה האוטומטי "בא לי" - ראו lib/metaAutoReply.ts
// GET: אימות חד-פעמי של הכתובת בהגדרת ה-Webhook באפליקציה במטא
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('hub.mode') === 'subscribe' && searchParams.get('hub.verify_token') === process.env.META_WEBHOOK_VERIFY_TOKEN && searchParams.get('hub.challenge')) {
    return new Response(searchParams.get('hub.challenge'), { status: 200 });
  }
  return NextResponse.json({ error: 'אימות נכשל' }, { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }
  let body: unknown = null;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }
  try {
    const handled = await processWebhook(body);
    return NextResponse.json({ ok: true, handled });
  } catch (e) {
    console.error('meta webhook error', (e as Error).message);
    return NextResponse.json({ ok: true }); // מטא משביתה webhook שמחזיר שגיאות - תמיד 200
  }
}
