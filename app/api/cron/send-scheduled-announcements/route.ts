import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { sendAnnouncementNotification } from '@/lib/announcementNotify';

// נקרא כל כמה דקות - לא דרך קרון של Vercel (בחשבון Hobby קרון מוגבל לפעם ביום, לא מספיק כדי
// לכבד תזמון שהוא "בעוד שעה") אלא דרך pg_cron+pg_net ב-Supabase עצמו, שאין לו הגבלת תדירות
// כזו - ר' מיגרציית schedule_send_scheduled_announcements_job. מוצא הודעות לוח מודעות
// שתוזמנו לשליחת התראה (scheduled_notify_at) ושהזמן שלהן כבר הגיע, ושולח את ההתראה בפועל.
// שירן עדיין מאשרת/מפרסמת את ההודעה בעצמה כרגיל - זה רק דוחה את השלב הנפרד של "מתי בדיוק
// תישלח ההתראה", לא מפרסם שום דבר חדש אוטומטית. סוד נפרד מ-CRON_SECRET (לא קרון של Vercel)
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.PG_CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: due, error } = await supabaseAdmin
    .from('announcements')
    .select('id')
    .not('scheduled_notify_at', 'is', null)
    .lte('scheduled_notify_at', new Date().toISOString())
    .is('notification_sent_at', null);

  if (error) {
    console.error('send-scheduled-announcements: שגיאה באיתור הודעות מתוזמנות', error);
    return NextResponse.json({ error: 'שגיאה באיתור הודעות מתוזמנות' }, { status: 500 });
  }

  const results = [];
  for (const row of due || []) {
    const sent = await sendAnnouncementNotification(row.id);
    if ('error' in sent) {
      console.error(`send-scheduled-announcements: נכשל עבור ${row.id}`, sent.error);
      results.push({ id: row.id, ok: false, error: sent.error });
    } else {
      results.push({ id: row.id, ok: true, ...sent.result });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
