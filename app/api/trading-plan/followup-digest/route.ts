import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { buildFollowupDigestEmailHtml, buildFollowupUserEmailHtml } from '@/lib/tradingPlan/emailContent';

async function sendEmail(apiKey: string, to: string, subject: string, html: string, from: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    console.error(`שגיאה בשליחת מייל תזכורת פולואפ אל ${to}`, await res.text());
    return false;
  }
  return true;
}

// GET - מופעל ע"י Vercel Cron מדי בוקר. שולח לשירן מייל מרוכז אחד עם כל מי שמילא
// את השאלון לפני 7 ימים ומעלה ועדיין לא נשלחה עבורו תזכורת, ובמקביל שולח לכל אחד מהם
// מייל אישי אוטומטי בשם שירן. is('followup_notified_at', null) דואג שלא נשלח פעמיים
// לאותו אדם, גם אם ה-cron מדלג על יום.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const authHeader = request.headers.get('authorization');
  const providedToken = authHeader?.replace('Bearer ', '') || searchParams.get('token');

  if (providedToken !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from('trading_plan_responses')
    .select('*')
    .eq('status', 'completed')
    .is('followup_notified_at', null)
    .lte('completed_at', sevenDaysAgo)
    .order('completed_at', { ascending: true });

  if (error) {
    console.error('שגיאה בשליפת רשומות לתזכורת פולואפ', error);
    return NextResponse.json({ error: 'שגיאה בשליפה' }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, sent: false, count: 0 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY לא מוגדר - לא נשלחה תזכורת פולואפ');
    return NextResponse.json({ ok: true, sent: false, count: rows.length });
  }

  const [digestSent, userEmailResults] = await Promise.all([
    sendEmail(
      apiKey,
      'shiran@shirandimor.com',
      `תזכורת פולואפ - ${rows.length} ${rows.length === 1 ? 'אדם' : 'אנשים'} השבוע`,
      buildFollowupDigestEmailHtml(rows as any),
      'תזכורות פולואפ <noreply@shirandimor.com>'
    ),
    Promise.allSettled(
      rows.map((r) =>
        r.email
          ? sendEmail(apiKey, r.email, 'עבר בדיוק שבוע - אז איך הולך?', buildFollowupUserEmailHtml(r as any), 'שירן דימור <noreply@shirandimor.com>')
          : Promise.resolve(false)
      )
    ),
  ]);

  const userEmailsSent = userEmailResults.filter((r) => r.status === 'fulfilled' && r.value === true).length;

  // מסמנים כ"נשלח" רק אם המייל המרוכז לשירן הצליח - אם לא, ה-cron הבא ינסה שוב לכולם
  if (digestSent) {
    await supabaseAdmin
      .from('trading_plan_responses')
      .update({ followup_notified_at: new Date().toISOString() })
      .in('id', rows.map((r) => r.id));
  } else {
    console.error('שגיאה בשליחת מייל התזכורת המרוכז - לא מסמנים כנשלח, ננסה שוב מחר');
  }

  return NextResponse.json({ ok: true, digestSent, userEmailsSent, count: rows.length });
}
