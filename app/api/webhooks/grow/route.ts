import { NextResponse } from 'next/server';
import { parseGrowPayload, syncGrowPaymentToMonday, FIRST_MONTH_PRICE } from '@/lib/grow';
import { ensureActiveSubscriberAccount } from '@/lib/subscriberStatus';
import { sendLoginEmail, supabaseAdmin } from '@/lib/instantLogin';
import { sendPushToUsers } from '@/lib/webPush';

// מתריע לשירן בפוש אם משהו בטיפול בתשלום נכשל בשקט - בלי זה מישהו יכול לשלם, להופיע במאנדיי,
// ולא לקבל חשבון עובד באתר (או מייל כניסה) בלי שום סימן לבעיה עד שמישהו יפתח פניה בעצמו
async function alertAdmins(title: string, bodyText: string) {
  try {
    const { data: admins } = await supabaseAdmin.from('profiles').select('id').eq('role', 'admin');
    await sendPushToUsers((admins || []).map((a) => a.id), { title, body: bodyText, url: '/admin/subscribers' });
  } catch (e) {
    console.error('Grow webhook: נכשלה גם ההתראה על הכישלון', e);
  }
}

// מקבל התראת תשלום מ-Grow (server-to-server callback) בכל פעם שלקוח נרשם וחויב, מעדכן את הפריט
// שלו במאנדיי (עלות חודשית, תאריך הרשמה, הטבת חודש ראשון אם רלוונטי) ומעביר אותו לקבוצת
// "קבוצת סוחרים" - ומאשר אותו כמנוי פעיל באתר (או יוצר לו חשבון, אם עוד אין).
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

  const mondayResult = await syncGrowPaymentToMonday(payment);
  if (!mondayResult.ok) {
    console.error('Grow webhook: סנכרון מאנדיי נכשל', mondayResult.reason);
    await alertAdmins('⚠️ תשלום התקבל, סנכרון מאנדיי נכשל', `${payment.fullName || payment.phone || payment.email || 'מנוי/ה'} - ${mondayResult.reason}`);
  }

  // תמיד מפעילים את החשבון, גם אם Grow לא העביר מייל בתשלום הזה (קרה בפועל - תשלום שהתקבל
  // והופיע במאנדיי, בלי שום חשבון נוצר באתר כי כל הבלוק הזה פשוט לא רץ). ensureActiveSubscriberAccount
  // מתמודד עם מייל חסר בעצמו (מתאים לפי טלפון, ואם צריך ליצור חשבון חדש - עם placeholder זמני)
  let siteAccount: 'ok' | 'error' = 'ok';
  try {
    await ensureActiveSubscriberAccount(
      payment.email || '', payment.phone || '', payment.fullName || payment.email || payment.phone || '',
      undefined, payment.amount === FIRST_MONTH_PRICE
    );
    if (payment.email) {
      await sendLoginEmail(payment.email);
    } else {
      console.error('Grow webhook: אין מייל בבקשה - החשבון הופעל לפי טלפון בלבד, לא נשלח מייל כניסה', body);
    }
  } catch (e) {
    console.error('Grow webhook: נכשל אישור המנוי באתר', e);
    siteAccount = 'error';
    await alertAdmins('⚠️ תשלום התקבל, החשבון באתר נכשל', `${payment.fullName || payment.phone || payment.email || 'מנוי/ה'} שילם/ה אבל לא קיבל/ה גישה פעילה באתר - צריך לטפל ידנית`);
  }

  return NextResponse.json({ ok: true, monday: mondayResult.ok, siteAccount });
}
