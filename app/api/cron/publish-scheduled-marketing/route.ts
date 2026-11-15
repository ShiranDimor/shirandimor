import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { MAX_PUBLISH_ATTEMPTS, publishMarketingPost, renderSlidesIfNeeded } from '@/lib/marketingPublisher';

export const maxDuration = 60;

// נקרא כל 15 דקות דרך pg_cron+pg_net ב-Supabase (כמו send-scheduled-announcements - קרון של
// Vercel ב-Hobby רץ רק פעם ביום). שני תפקידים:
// 1. פרסום: פוסטים ששירן אישרה ותזמנה (status = 'scheduled') ושזמנם הגיע. טיוטות ופוסטים
//    "מאושרים" בלי תזמון לא נוגעים בהם. פוסט שנכשל 3 פעמים נעצר ומחכה לטיפול ידני.
// 2. רינדור: פוסטים חדשים מחבילת תוכן (slides_html) שעוד אין להם תמונות - כדי ששירן תראה
//    תמונות אמיתיות כשהיא נכנסת לאשר. כמה פוסטים בכל סבב, כל עוד יש זמן.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.PG_CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const { data: due, error } = await supabaseAdmin
    .from('marketing_posts')
    .select('id, publish_attempts')
    .eq('status', 'scheduled')
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', new Date().toISOString())
    .lt('publish_attempts', MAX_PUBLISH_ATTEMPTS)
    .order('scheduled_at', { ascending: true })
    .limit(3);

  if (error) {
    console.error('publish-scheduled-marketing: שגיאה באיתור פוסטים מתוזמנים', error);
    return NextResponse.json({ error: 'שגיאה באיתור פוסטים מתוזמנים' }, { status: 500 });
  }

  const published = [];
  for (const row of due || []) {
    if (Date.now() - startedAt > 40_000) break; // השאר לסבב הבא
    try {
      const outcome = await publishMarketingPost(row.id);
      published.push({ id: row.id, ...outcome });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'שגיאה לא ידועה';
      console.error(`publish-scheduled-marketing: נכשל עבור ${row.id}`, message);
      await supabaseAdmin
        .from('marketing_posts')
        .update({ publish_error: message, publish_attempts: (row.publish_attempts || 0) + 1, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      published.push({ id: row.id, allDone: false, error: message });
    }
  }

  // כל עוד נשאר זמן בריצה - פוסט אחרי פוסט (כל פוסט עד כמה שניות לשקף)
  const rendered: string[] = [];
  const failedRender = new Set<string>();
  while (Date.now() - startedAt < 25_000) {
    const { data: pending } = await supabaseAdmin
      .from('marketing_posts')
      .select('id')
      .not('slides_html', 'is', null)
      .is('image_base64', null)
      .neq('status', 'archived')
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .limit(5);
    const next = (pending || []).find((row) => !failedRender.has(row.id));
    if (!next) break;
    try {
      await renderSlidesIfNeeded(next.id);
      rendered.push(next.id);
    } catch (e) {
      failedRender.add(next.id);
      console.error('publish-scheduled-marketing: רינדור נכשל', next.id, e);
    }
  }

  return NextResponse.json({ ok: true, published, rendered });
}
