import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { buildAbandonedEmailHtml } from '@/lib/tradingPlan/emailContent';
import { syncTradingPlanLead, TRADING_PLAN_ABANDONED_STATUS_LABEL } from '@/lib/crm';
import { isActiveSubscriber } from '@/lib/subscriberStatus';

async function sendEmail(apiKey: string, to: string, subject: string, html: string, from: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, html, reply_to: 'shiran@shirandimor.com' }),
  });
  if (!res.ok) {
    console.error(`שגיאה בשליחת מייל נטישה אל ${to}`, await res.text());
    return false;
  }
  return true;
}

const IDLE_HOURS_BEFORE_FIRST_REMINDER = 1;
const HOURS_BETWEEN_REMINDERS = 24;

// GET - מופעל ע"י Vercel Cron. מטפל במי שהתחיל למלא את "תוכנית המסחר" ולא סיים:
// תזכורת #1 - שעה אחרי שהפסיק לגעת בטופס. תזכורת #2 (אחרונה) - יממה אחרי תזכורת #1, אם עדיין לא השלים.
// אחרי 2 תזכורות מפסיקים לגמרי. ה-CRM מתעדכן לסטטוס "יצא באמצע התוכנית מסחר" בתזכורת הראשונה בלבד.
//
// מצב תצוגה מקדימה (לא נוגע בנתונים): ?preview=1&to=<email> שולח את שתי התזכורות לכתובת שצוינה, עם נתוני דוגמה.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const authHeader = request.headers.get('authorization');
  const providedToken = authHeader?.replace('Bearer ', '') || searchParams.get('token');

  if (providedToken !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;

  if (searchParams.get('preview') === '1') {
    const to = searchParams.get('to') || 'shiran@shirandimor.com';
    if (!apiKey) return NextResponse.json({ error: 'RESEND_API_KEY לא מוגדר' }, { status: 500 });

    const sampleRow = { id: 'preview-id', name: 'שירן' };
    const sent1 = await sendEmail(apiKey, to, '[דוגמה] התוכנית שלך מחכה לך', buildAbandonedEmailHtml(sampleRow, 1), 'שירן דימור <noreply@shirandimor.com>');
    const sent2 = await sendEmail(apiKey, to, '[דוגמה] תזכורת אחרונה - התוכנית שלך מחכה לך', buildAbandonedEmailHtml(sampleRow, 2), 'שירן דימור <noreply@shirandimor.com>');

    return NextResponse.json({ ok: true, preview: true, to, sent1, sent2 });
  }

  const firstReminderCutoff = new Date(Date.now() - IDLE_HOURS_BEFORE_FIRST_REMINDER * 60 * 60 * 1000).toISOString();
  const secondReminderCutoff = new Date(Date.now() - HOURS_BETWEEN_REMINDERS * 60 * 60 * 1000).toISOString();

  const [{ data: firstBatch, error: firstError }, { data: secondBatch, error: secondError }] = await Promise.all([
    supabaseAdmin
      .from('trading_plan_responses')
      .select('*')
      .eq('status', 'in_progress')
      .eq('abandon_reminder_count', 0)
      .lte('updated_at', firstReminderCutoff),
    supabaseAdmin
      .from('trading_plan_responses')
      .select('*')
      .eq('status', 'in_progress')
      .eq('abandon_reminder_count', 1)
      .lte('abandon_email_sent_at', secondReminderCutoff),
  ]);

  if (firstError || secondError) {
    console.error('שגיאה בשליפת רשומות ננטשות', firstError || secondError);
    return NextResponse.json({ error: 'שגיאה בשליפה' }, { status: 500 });
  }

  let emailsSent = 0;
  let crmSynced = 0;

  for (const row of firstBatch || []) {
    // מנוי שכבר המיר לא צריך תזכורת "בואי נסיים כדי להצטרף" ולא כרטיס ליד חדש ב-CRM - מאותה
    // סיבה שגם מייל "ליד חדש" מיותר עבור מנוי שממלא את התוכנית עד הסוף
    const isSubscriber = await isActiveSubscriber(row.phone, row.email);

    if (!isSubscriber) {
      if (apiKey && row.email) {
        const sent = await sendEmail(apiKey, row.email, 'התוכנית שלך מחכה לך - נשארו כמה דקות לסיים', buildAbandonedEmailHtml(row, 1), 'שירן דימור <noreply@shirandimor.com>').catch(() => false);
        if (sent) emailsSent++;
      }
      if (row.phone) {
        const result = await syncTradingPlanLead(row, { statusLabel: TRADING_PLAN_ABANDONED_STATUS_LABEL, completed: false }).catch(() => null);
        if (result?.ok) crmSynced++;
      }
    }
    await supabaseAdmin.from('trading_plan_responses').update({ abandon_reminder_count: 1, abandon_email_sent_at: new Date().toISOString() }).eq('id', row.id);
  }

  for (const row of secondBatch || []) {
    const isSubscriber = await isActiveSubscriber(row.phone, row.email);
    if (!isSubscriber && apiKey && row.email) {
      const sent = await sendEmail(apiKey, row.email, 'תזכורת אחרונה - התוכנית שלך מחכה לך', buildAbandonedEmailHtml(row, 2), 'שירן דימור <noreply@shirandimor.com>').catch(() => false);
      if (sent) emailsSent++;
    }
    await supabaseAdmin.from('trading_plan_responses').update({ abandon_reminder_count: 2, abandon_email_sent_at: new Date().toISOString() }).eq('id', row.id);
  }

  return NextResponse.json({ ok: true, firstReminders: (firstBatch || []).length, secondReminders: (secondBatch || []).length, emailsSent, crmSynced });
}
