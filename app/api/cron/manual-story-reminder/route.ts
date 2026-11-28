import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { sendPushToAdmins } from '@/lib/webPush';

// סטורי אחד ביום עולה לאינסטגרם ידנית ע"י שירן, כדי שיהיה עליו סטיקר לינק לחיץ (אי אפשר דרך ה-API).
// הסטורי הזה מסומן בנושא שמתחיל ב-"📲" ועולה לבד כרגיל לשתי הפלטפורמות (כך שגם אם שירן לא
// מספיקה, הוא בחוץ). נקרא כל 15 דק' דרך pg_cron: אחרי שהגיע הזמן שלו, שולח לשירן התראה לטלפון
// פעם אחת, כדי שתעלה אותו שוב לאינסטגרם עם סטיקר לינק (אי אפשר להוסיף סטיקר לסטורי שכבר עלה).
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.PG_CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const now = Date.now();
  const { data, error } = await supabaseAdmin
    .from('marketing_posts')
    .select('id, topic, scheduled_at, status')
    .like('topic', '📲%')
    .in('status', ['scheduled', 'approved', 'published'])
    .gte('scheduled_at', new Date(now - 45 * 60 * 1000).toISOString())
    .lte('scheduled_at', new Date(now).toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let sent = 0;
  for (const p of data || []) {
    const { data: prev } = await supabaseAdmin.from('notification_log').select('id').eq('source_id', p.id).like('title', '📲%').limit(1);
    if (prev?.length) continue;
    await sendPushToAdmins(
      { title: '📲 הסטורי של היום עלה - להוסיף לינק לחיץ', body: 'רוצה לינק לחיץ? שמרי את התמונה מלוח הבקרה, העלי אותה שוב לאינסטגרם עם סטיקר לינק: shirandimor.com/subscribe?src=ig_story (אם לא תספיקי, הסטורי כבר בחוץ)', url: '/admin/marketing' },
      'announcement',
      p.id
    );
    sent++;
  }
  return NextResponse.json({ ok: true, sent });
}
