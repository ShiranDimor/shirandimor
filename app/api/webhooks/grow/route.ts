import { NextResponse } from 'next/server';
import { parseGrowPayload } from '@/lib/grow';
import { syncGrowPaymentToCrm } from '@/lib/crm';
import { ensureActiveSubscriberAccount } from '@/lib/subscriberStatus';
import { sendLoginEmail } from '@/lib/instantLogin';

// מקבל התראת תשלום מ-Grow (server-to-server callback) בכל פעם שלקוח נרשם וחויב, מעדכן את איש
// הקשר ב-CRM הפנימי (עלות חודשית, תאריך הרשמה, הטבת חודש ראשון אם רלוונטי) לשלב "מנוי" -
// ומאשר אותו כמנוי פעיל באתר (או יוצר לו חשבון, אם עוד אין).
export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || '';
  let body: Record<string, unknown> = {};

  try {
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else {
      const form = await request.formData();
      body = Object.fromEntries(form.entries());
    }
  } catch (e) {
    console.error('Grow webhook: לא ניתן לפענח את גוף הבקשה', e);
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  // רושמים את גוף הבקשה הגולמי (וה-headers) מייד עם הקבלה, לפני כל בדיקת אימות/תוקף - כדי שגם
  // בקשה שנדחית תישאר ניתנת לאבחון בלוגים, ולא "תיעלם" בלי עקבות
  console.log('Grow webhook: בקשה גולמית התקבלה', {
    headers: Object.fromEntries(request.headers.entries()),
    body,
  });

  const payment = parseGrowPayload(body);
  const headerKey =
    request.headers.get('x-webhook-key') ||
    request.headers.get('webhook-key') ||
    request.headers.get('x-api-key') ||
    request.headers.get('x-grow-webhook-key');

  const expectedKey = process.env.GROW_WEBHOOK_SECRET;
  if (expectedKey) {
    if (payment.webhookKey !== expectedKey && headerKey !== expectedKey) {
      console.error('Grow webhook: מפתח אימות שגוי או חסר', { bodyKey: payment.webhookKey, headerKey });
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  } else {
    // עדיין לא הוגדר GROW_WEBHOOK_SECRET בסביבה - לוג בולט כדי שלא יישכח להגדיר לפני עלייה לאוויר,
    // בלי לחסום את הפיתוח/הבדיקה הראשונית
    console.error('Grow webhook: GROW_WEBHOOK_SECRET לא מוגדר - הבקשה מתקבלת ללא אימות מקור');
  }

  if (!payment.phone && !payment.email) {
    console.error('Grow webhook: אין טלפון או מייל בבקשה', body);
    return NextResponse.json({ ok: false, error: 'missing_contact' }, { status: 400 });
  }

  console.log('Grow webhook: התקבל תשלום', { ...payment, raw: body });

  const crmResult = await syncGrowPaymentToCrm(payment);
  if (!crmResult.ok) {
    console.error('Grow webhook: סנכרון CRM נכשל', crmResult.reason);
  }

  let siteAccount: 'ok' | 'skipped_no_email' | 'error' = 'skipped_no_email';
  if (payment.email) {
    try {
      await ensureActiveSubscriberAccount(payment.email, payment.phone || '', payment.fullName || payment.email);
      await sendLoginEmail(payment.email);
      siteAccount = 'ok';
    } catch (e) {
      console.error('Grow webhook: נכשל אישור המנוי באתר', e);
      siteAccount = 'error';
    }
  } else {
    console.error('Grow webhook: אין מייל בבקשה - לא ניתן ליצור/לאשר חשבון באתר', body);
  }

  return NextResponse.json({ ok: true, crm: crmResult.ok, siteAccount });
}
