import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { buildAbandonedEmailHtml } from '@/lib/tradingPlan/emailContent';
import { syncTradingPlanLead, TRADING_PLAN_ABANDONED_STATUS_LABEL } from '@/lib/tradingPlan/monday';

async function sendEmail(apiKey: string, to: string, subject: string, html: string, from: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    console.error(`שגיאה בשליחת מייל נטישה אל ${to}`, await res.text());
    return false;
  }
  return true;
}

const IDLE_HOURS_BEFORE_NUDGE = 1;

// GET - מופעל ע"י Vercel Cron. מטפל במי שהתחיל למלא את "תוכנית המסחר" ולא סיים, ולפחות
// שעה עברה מאז העדכון האחרון שלו (כדי לא להטריד מישהו שעדיין באמצע מילוי פעיל):
// שולח לו מייל עם לינק להמשך (אם יש מייל), ומעדכן במאנדיי לסטטוס "יצא באמצע התוכנית מסחר".
// abandon_email_sent_at מסמן שכבר טופל - כדי לא לחזור על זה שוב בכל הרצה.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const authHeader = request.headers.get('authorization');
  const providedToken = authHeader?.replace('Bearer ', '') || searchParams.get('token');

  if (providedToken !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const idleCutoff = new Date(Date.now() - IDLE_HOURS_BEFORE_NUDGE * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from('trading_plan_responses')
    .select('*')
    .eq('status', 'in_progress')
    .is('abandon_email_sent_at', null)
    .lte('updated_at', idleCutoff)
    .order('updated_at', { ascending: true });

  if (error) {
    console.error('שגיאה בשליפת רשומות ננטשות', error);
    return NextResponse.json({ error: 'שגיאה בשליפה' }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, count: 0 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  let emailsSent = 0;
  let mondaySynced = 0;

  for (const row of rows) {
    if (apiKey && row.email) {
      const sent = await sendEmail(
        apiKey,
        row.email,
        'התוכנית שלך מחכה לך - נשארו כמה דקות לסיים',
        buildAbandonedEmailHtml(row),
        'שירן דימור <onboarding@resend.dev>'
      ).catch(() => false);
      if (sent) emailsSent++;
    }

    if (row.phone) {
      const result = await syncTradingPlanLead(row, { statusLabel: TRADING_PLAN_ABANDONED_STATUS_LABEL, completed: false }).catch(() => null);
      if (result?.ok) mondaySynced++;
    }

    await supabaseAdmin
      .from('trading_plan_responses')
      .update({ abandon_email_sent_at: new Date().toISOString() })
      .eq('id', row.id);
  }

  return NextResponse.json({ ok: true, count: rows.length, emailsSent, mondaySynced });
}
