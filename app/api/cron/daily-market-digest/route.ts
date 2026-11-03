import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { generateMarketDigest } from '@/lib/marketDigest';
import { sendPushToUsers } from '@/lib/webPush';

export const maxDuration = 60;

// רץ כל בוקר (ראשון-שישי, לא שבת - ר' vercel.json) ומכין סיכום שוק יומי כטיוטה בלבד
// (published=false) - שירן מקבלת התראת פוש, נכנסת ללוח המודעות, בודקת ורק אז לוחצת
// "אישור ופרסום" בעצמה. שום דבר לא מתפרסם או נשלח אוטומטית בלי אישור שלה
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const digest = await generateMarketDigest();
    if (!digest) {
      console.error('סיכום שוק יומי: אין מספיק מידע מאומת לפרסום היום');
      return NextResponse.json({ ok: true, posted: false, reason: 'no_digest' });
    }

    const { error } = await supabaseAdmin.from('announcements').insert({ title: digest.title, content: digest.content, published: false });
    if (error) {
      console.error('סיכום שוק יומי: שגיאה בשמירה', error);
      return NextResponse.json({ ok: false, error: 'שגיאה בשמירה' }, { status: 500 });
    }

    const { data: admins } = await supabaseAdmin.from('profiles').select('id').eq('role', 'admin');
    await sendPushToUsers(
      (admins || []).map((a) => a.id),
      { title: '📰 סיכום השוק של היום מוכן', body: 'מחכה לאישור שלך לפני שהוא עולה ללוח המודעות', url: '/admin/announcements' }
    );

    return NextResponse.json({ ok: true, drafted: true });
  } catch (e) {
    console.error('סיכום שוק יומי: נכשל', e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 });
  }
}
