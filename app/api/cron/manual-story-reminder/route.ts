import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { sendPushToAdmins } from '@/lib/webPush';

// סטורי אחד ביום עולה לאינסטגרם ידנית ע"י שירן, כדי שיהיה עליו סטיקר לינק לחיץ (אי אפשר דרך ה-API).
// הסטורי הזה מסומן בנושא שמתחיל ב-"📲" ו-platform='facebook' (לפייסבוק הוא עולה לבד).
// נקרא כל 15 דק' דרך pg_cron: 10 דק' לפני הזמן שולח לשירן התראה לטלפון, פעם אחת.
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
    .gte('scheduled_at', new Date(now - 5 * 60 * 1000).toISOString())
    .lte('scheduled_at', new Date(now + 20 * 60 * 1000).toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let sent = 0;
  for (const p of data || []) {
    const { data: prev } = await supabaseAdmin.from('notification_log').select('id').eq('source_id', p.id).like('title', '📲%').limit(1);
    if (prev?.length) continue;
    await sendPushToAdmins(
      { title: '📲 הסטורי עם הלינק של היום', body: 'שמרי את התמונה מלוח הבקרה, העלי לאינסטגרם והוסיפי סטיקר לינק: shirandimor.com/subscribe?src=ig_story', url: '/admin/marketing' },
      'announcement',
      p.id
    );
    sent++;
  }
  return NextResponse.json({ ok: true, sent });
}
