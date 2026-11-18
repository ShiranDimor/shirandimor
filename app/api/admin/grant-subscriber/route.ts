import { NextResponse } from 'next/server';
import { sendLoginEmail, supabaseAdmin } from '@/lib/instantLogin';
import { ensureActiveSubscriberAccount } from '@/lib/subscriberStatus';
import { syncGrowPaymentToMonday } from '@/lib/grow';
import { startSequence } from '@/lib/sequenceEngine';

// true (לא אובייקט user אמיתי) כשהקריאה מאומתת דרך AGENT_ADMIN_SECRET (שרת-לשרת, בלי
// סשן אדמין בדפדפן) - לשימוש חד-פעמי כשסוכן/ת (לא שירן בדפדפן) צריך/ה לתקן ידנית מקרה
// דחוף (למשל תשלום Grow שהלך לאיבוד) בלי לחכות שהיא תפתח את העמוד ותלחץ בעצמה
async function requireAdmin(request: Request): Promise<{ id: string } | true | null> {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  if (process.env.AGENT_ADMIN_SECRET && token === process.env.AGENT_ADMIN_SECRET) return true;

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// POST - הענקת חשבון מנוי/ה ידנית (לא דרך ה-webhook של Grow) - לשימוש במקרים חד-פעמיים כמו
// הרשמה לניסיון, או שחזור תשלום אמיתי שה-webhook של Grow לא הגיע/נכשל לטפל בו (ר' קישור
// "payment" למטה). עושה בדיוק את מה ש-app/api/webhooks/grow עושה: יוצר/מפעיל חשבון, שולח
// מייל כניסה, מתחיל את רצף הקליטה אם זו הצטרפות אמיתית חדשה, ואם ניתן גם payment - מסנכרן
// למאנדיי (מעביר כרטיס קיים ל"קבוצת סוחרים" + מעדכן עלות/תאריך/הטבה) בדיוק כמו תשלום אמיתי
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const payment = body?.payment as { amount?: number; transactionId?: string; isFirstMonthPrice?: boolean } | undefined;

  if (!name || !email) {
    return NextResponse.json({ error: 'חסר שם או מייל' }, { status: 400 });
  }

  try {
    const { userId, newlyActivated } = await ensureActiveSubscriberAccount(email, phone, name, undefined, Boolean(payment?.isFirstMonthPrice), payment?.amount);

    // רק מי שבהטבת חודש ראשון ב-1 ש"ח מקבל/ת את רצף הקליטה - מנוי/ה ותיק/ה (400 ש"ח) לא צריך/ה
    if (newlyActivated && payment?.isFirstMonthPrice) {
      await startSequence('welcome-subscriber', { userId }).catch((e) => console.error('grant-subscriber: נכשלה התחלת רצף הקליטה', e));
    }

    await sendLoginEmail(email).catch((e) => console.error('grant-subscriber: נכשלה שליחת מייל כניסה', e));

    let mondaySynced: boolean | undefined;
    if (payment) {
      const result = await syncGrowPaymentToMonday({
        phone: phone || null,
        email,
        fullName: name,
        amount: payment.amount ?? null,
        transactionId: payment.transactionId ?? null,
        webhookKey: null,
      }).catch((e) => ({ ok: false, reason: e instanceof Error ? e.message : 'threw' }));
      mondaySynced = result.ok;
    }

    return NextResponse.json({ ok: true, newlyActivated, mondaySynced });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה ביצירת החשבון' }, { status: 500 });
  }
}
