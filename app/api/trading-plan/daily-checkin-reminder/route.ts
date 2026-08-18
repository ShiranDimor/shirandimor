import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { buildDailyProgressReminderEmailHtml } from '@/lib/tradingPlan/emailContent';

async function sendEmail(apiKey: string, to: string, subject: string, html: string, from: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    console.error(`שגיאה בשליחת מייל תזכורת מעקב יומית אל ${to}`, await res.text());
    return false;
  }
  return true;
}

const DAYS_TO_KEEP_REMINDING = 30;

function todayIsrael(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

// GET - מופעל ע"י Vercel Cron מדי בוקר. שולח לכל מי שהשלים את תוכנית המסחר (וב-30 הימים האחרונים
// מאז ההשלמה - לא יותר) תזכורת קצרה לחזור לעמוד "המעקב האישי" ולסמן אם עמדו היום בכלל שלהם.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const authHeader = request.headers.get('authorization');
  const providedToken = authHeader?.replace('Bearer ', '') || searchParams.get('token');

  if (providedToken !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY לא מוגדר - לא נשלחו תזכורות מעקב יומיות');
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const cutoff = new Date(Date.now() - DAYS_TO_KEEP_REMINDING * 24 * 60 * 60 * 1000).toISOString();
  const today = todayIsrael();

  const { data: rows, error } = await supabaseAdmin
    .from('trading_plan_responses')
    .select('id, name, email, completed_at, last_daily_reminder_sent_date')
    .eq('status', 'completed')
    .not('email', 'is', null)
    .gte('completed_at', cutoff)
    .or(`last_daily_reminder_sent_date.is.null,last_daily_reminder_sent_date.neq.${today}`);

  if (error) {
    console.error('שגיאה בשליפת רשומות לתזכורת מעקב יומית', error);
    return NextResponse.json({ error: 'שגיאה בשליפה' }, { status: 500 });
  }

  let sent = 0;

  for (const row of rows || []) {
    const ok = await sendEmail(apiKey, row.email as string, 'בוקר טוב - עמדת היום בכלל שלך?', buildDailyProgressReminderEmailHtml(row), 'שירן דימור <onboarding@resend.dev>').catch(() => false);
    if (ok) {
      sent++;
      await supabaseAdmin.from('trading_plan_responses').update({ last_daily_reminder_sent_date: today }).eq('id', row.id);
    }
  }

  return NextResponse.json({ ok: true, count: (rows || []).length, sent });
}
