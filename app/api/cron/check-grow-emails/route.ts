import { NextResponse } from 'next/server';
import { listRecentGrowPayments } from '@/lib/growEmailWatch';
import { ensureActiveSubscriberAccount } from '@/lib/subscriberStatus';
import { sendLoginEmail, supabaseAdmin } from '@/lib/instantLogin';
import { syncGrowPaymentToMonday, FIRST_MONTH_PRICE } from '@/lib/grow';
import { startSequence } from '@/lib/sequenceEngine';
import { sendPushToUsers } from '@/lib/webPush';

export const maxDuration = 120;

async function alertAdmins(title: string, bodyText: string) {
  try {
    const { data: admins } = await supabaseAdmin.from('profiles').select('id').eq('role', 'admin');
    await sendPushToUsers((admins || []).map((a) => a.id), { title, body: bodyText, url: '/admin/subscribers' });
  } catch (e) {
    console.error('check-grow-emails: נכשלה גם ההתראה', e);
  }
}

// רשת ביטחון עצמאית לגמרי מה-webhook של Grow (ר' lib/growEmailWatch.ts) - רץ כל רבע שעה (דרך
// pg_cron ב-Supabase, לא cron של Vercel עצמו - אותו פתרון בדיוק כמו send-scheduled-announcements,
// כי Vercel Hobby מוגבל לקרון פעם ביום). לכל תשלום שנמצא במייל ועדיין אין לו חשבון באתר - מפעיל
// בדיוק את מה שה-webhook היה אמור לעשות, ומתריעה שזה קרה (כדי שתמיד נדע שזה "תפס" משהו)
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.PG_CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payments = await listRecentGrowPayments(3);
  if (payments === null) {
    return NextResponse.json({ ok: false, error: 'gmail_not_configured_or_failed' }, { status: 500 });
  }

  let recovered = 0;
  let alreadyActive = 0;
  let failed = 0;

  for (const payment of payments) {
    if (!payment.email) continue; // ensureActiveSubscriberAccount דורש אימייל אמיתי כדי שההתחברות תעבוד

    try {
      const { userId, newlyActivated } = await ensureActiveSubscriberAccount(
        payment.email, payment.phone, payment.name, undefined, payment.amount === FIRST_MONTH_PRICE
      );

      if (!newlyActivated) {
        alreadyActive++;
        continue;
      }

      await startSequence('welcome-subscriber', { userId }).catch((e) => console.error('check-grow-emails: נכשלה התחלת רצף הקליטה', e));
      await sendLoginEmail(payment.email).catch((e) => console.error('check-grow-emails: נכשלה שליחת מייל כניסה', e));
      await syncGrowPaymentToMonday({
        phone: payment.phone, email: payment.email, fullName: payment.name,
        amount: payment.amount, transactionId: payment.transactionId, webhookKey: null,
      }).catch((e) => console.error('check-grow-emails: נכשל סנכרון מאנדיי', e));

      recovered++;
      await alertAdmins(
        '🛟 תשלום שהוחמץ שוחזר דרך המייל',
        `${payment.name} (${payment.phone}) - ה-webhook של Grow לא טיפל בתשלום הזה, אבל המייל תפס אותו ועכשיו יש לו/ה גישה מלאה.`
      );
    } catch (e) {
      failed++;
      console.error(`check-grow-emails: נכשל שחזור עבור ${payment.name}`, e);
      await alertAdmins('⚠️ שחזור תשלום מהמייל נכשל', `${payment.name} (${payment.phone}) - צריך לטפל ידנית ב-/admin/subscribers`);
    }
  }

  return NextResponse.json({ ok: true, checked: payments.length, recovered, alreadyActive, failed });
}
