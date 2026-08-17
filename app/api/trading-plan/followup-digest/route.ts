import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { buildFollowupDigestEmailHtml } from '@/lib/tradingPlan/emailContent';

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
// את השאלון לפני 7 ימים ומעלה ועדיין לא נשלחה עבורו תזכורת - כדי לא לפספס פולואפ
// גם אם ה-cron מדלג על יום, ולא לשלוח כפול לאותו אדם.
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

  const sent = await sendEmail(
    apiKey,
    'shiran@shirandimor.com',
    `תזכורת פולואפ - ${rows.length} ${rows.length === 1 ? 'איש/ה' : 'אנשים'} השבוע`,
    buildFollowupDigestEmailHtml(rows as any),
    'תזכורות פולואפ <onboarding@resend.dev>'
  );

  if (sent) {
    await supabaseAdmin
      .from('trading_plan_responses')
      .update({ followup_notified_at: new Date().toISOString() })
      .in('id', rows.map((r) => r.id));
  }

  return NextResponse.json({ ok: true, sent, count: rows.length });
}
