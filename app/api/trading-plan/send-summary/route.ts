import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { buildUserPlanEmailHtml, buildAdminNotifyEmailHtml } from '@/lib/tradingPlan/emailContent';
import { syncTradingPlanLead } from '@/lib/tradingPlan/monday';
import { isActiveSubscriber } from '@/lib/subscriberStatus';

async function sendEmail(apiKey: string, to: string, subject: string, html: string, from: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    console.error(`שגיאה בשליחת מייל אל ${to}`, await res.text());
    return false;
  }
  return true;
}

// POST - שולח מייל עם התוכנית האישית למשתמש, ומייל התראה על ליד חדש לשירן
// body: { id: string }
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { id } = body as { id?: string };

  if (!id) {
    return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 });
  }

  const { data: row, error } = await supabaseAdmin
    .from('trading_plan_responses')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !row) {
    console.error('שגיאה בשליפת תוכנית המסחר לשליחת מייל', error);
    return NextResponse.json({ error: 'רשומה לא נמצאה' }, { status: 404 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  // מנוי כבר "המיר" - מייל "ליד חדש" לשירן מיותר עבורו ורק מוסיף רעש. התוכנית שלו עדיין נגישה
  // תמיד דרך כפתור "תוכנית מסחר" בעמוד הניהול שלו, פשוט בלי דחיפה אוטומטית ברגע ההשלמה.
  const isSubscriber = await isActiveSubscriber(row.phone as string | null, row.email as string | null);

  const results = await Promise.allSettled([
    apiKey && row.email
      ? sendEmail(apiKey, row.email, 'התוכנית שלך ל-30 הימים הקרובים במסחר', buildUserPlanEmailHtml(row), 'שירן דימור <onboarding@resend.dev>')
      : Promise.resolve(false),
    apiKey && !isSubscriber
      ? sendEmail(apiKey, 'shiran@shirandimor.com', 'התעניינות חדשה - תוכנית מסחר 30 יום', buildAdminNotifyEmailHtml(row), 'התראות האתר <onboarding@resend.dev>')
      : Promise.resolve(false),
    // מנוי כבר "המיר" - אין טעם ליצור/לעדכן עבורו כרטיס ליד ב-Monday.com, מאותה סיבה שגם מייל
    // "ליד חדש" מיותר עבורו למעלה
    !isSubscriber ? syncTradingPlanLead(row) : Promise.resolve({ ok: false, reason: 'already_subscriber' }),
  ]);

  if (!apiKey) console.error('RESEND_API_KEY לא מוגדר - לא נשלחו מיילים (Monday.com עדיין רץ בנפרד)');

  const userEmailSent = results[0].status === 'fulfilled' && results[0].value === true;
  const adminEmailSent = results[1].status === 'fulfilled' && results[1].value === true;
  const mondaySynced = results[2].status === 'fulfilled' && (results[2].value as any)?.ok === true;

  return NextResponse.json({ ok: true, userEmailSent, adminEmailSent, mondaySynced });
}
