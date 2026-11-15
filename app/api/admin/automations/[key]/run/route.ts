import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { buildAutomationMessage } from '@/lib/automations';

// market-digest קורא ל-generateMarketDigest, שיכול לקחת עד כמה דקות (חיפוש אינטרנט אמיתי
// עם ה-AI) - ר' הערה מקבילה ב-app/api/cron/daily-market-digest/route.ts
export const maxDuration = 300;

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

function israelDateKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

// POST - יצירת טיוטה עכשיו, ידנית, בלוח המודעות (published=false) עם הנתונים האמיתיים. משם
// ממשיכים כרגיל: עריכה/בדיקה לעצמי/אישור ופרסום ב-/admin/announcements. בכוונה לא בודק שבת/
// כבוי - זו פעולה ידנית של המנהלת עצמה, ולא שולח התראה לאף אחד. כן בודק טיוטה כפולה מהיום
// (force=true עוקף) - זה בדיוק מה שקרה בפועל עם "הלייבים שלנו השבוע": קרון + הרצה ידנית
// (או שתי הרצות ידניות) יצרו שתי טיוטות כמעט זהות שאושרו ופורסמו בנפרד
export async function POST(request: Request, { params }: { params: { key: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const force = body?.force === true;

  if (!force) {
    const { data: existingToday } = await supabaseAdmin
      .from('announcements')
      .select('id, created_at')
      .eq('source_automation_key', params.key)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingToday && israelDateKey(new Date(existingToday.created_at)) === israelDateKey(new Date())) {
      const time = new Date(existingToday.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
      return NextResponse.json({ error: 'already_today', message: `כבר נוצרה טיוטה היום לאוטומציה הזו (ב-${time}) - ליצור בכל זאת עוד אחת?` }, { status: 409 });
    }
  }

  let msg: { title: string; content: string };
  if (params.key === 'market-digest') {
    const { generateMarketDigest } = await import('@/lib/marketDigest');
    const digest = await generateMarketDigest();
    if ('reason' in digest) return NextResponse.json({ error: `הכנת הסיכום נכשלה: ${digest.reason}` }, { status: 500 });
    msg = digest;
  } else {
    const built = await buildAutomationMessage(params.key, false);
    if ('error' in built) {
      const reason = built.error ? REASON_LABELS[built.error] : undefined;
      return NextResponse.json({ error: reason ? `אין כרגע ממה ליצור את ההודעה: ${reason}` : 'לאוטומציה הזו אין נוסח קבוע' }, { status: 400 });
    }
    msg = built;
  }

  const { data, error } = await supabaseAdmin.from('announcements').insert({ title: msg.title, content: msg.content, published: false, source_automation_key: params.key }).select('id').single();
  if (error) return NextResponse.json({ error: 'שגיאה בשמירת הטיוטה' }, { status: 500 });

  return NextResponse.json({ ok: true, id: data.id });
}
