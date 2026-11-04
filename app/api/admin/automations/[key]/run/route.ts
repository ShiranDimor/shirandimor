import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { buildAutomationMessage } from '@/lib/automations';

export const maxDuration = 60;

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

const REASON_LABELS: Record<string, string> = {
  no_new_lessons: 'לא עלו שיעורים חדשים אתמול',
  no_lives_this_week: 'אין לייבים מתוכננים השבוע',
  no_live_tomorrow: 'אין לייב מתוכנן מחר',
  no_live_today: 'אין לייב מתוכנן היום',
  not_starting_soon: 'הלייב של היום לא מתחיל בשעה הקרובה',
};

// POST - יצירת טיוטה עכשיו, ידנית, בלוח המודעות (published=false) עם הנתונים האמיתיים. משם
// ממשיכים כרגיל: עריכה/בדיקה לעצמי/אישור ופרסום ב-/admin/announcements. בכוונה לא בודק שבת/
// כבוי - זו פעולה ידנית של המנהלת עצמה, ולא שולח התראה לאף אחד
export async function POST(request: Request, { params }: { params: { key: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  let msg: { title: string; content: string };
  if (params.key === 'market-digest') {
    const { generateMarketDigest } = await import('@/lib/marketDigest');
    const digest = await generateMarketDigest();
    if (!digest) return NextResponse.json({ error: 'הכנת הסיכום נכשלה - אפשר לנסות שוב' }, { status: 500 });
    msg = digest;
  } else {
    const built = await buildAutomationMessage(params.key, false);
    if ('error' in built) {
      const reason = built.error ? REASON_LABELS[built.error] : undefined;
      return NextResponse.json({ error: reason ? `אין כרגע ממה ליצור את ההודעה: ${reason}` : 'לאוטומציה הזו אין נוסח קבוע' }, { status: 400 });
    }
    msg = built;
  }

  const { data, error } = await supabaseAdmin.from('announcements').insert({ title: msg.title, content: msg.content, published: false }).select('id').single();
  if (error) return NextResponse.json({ error: 'שגיאה בשמירת הטיוטה' }, { status: 500 });

  return NextResponse.json({ ok: true, id: data.id });
}
