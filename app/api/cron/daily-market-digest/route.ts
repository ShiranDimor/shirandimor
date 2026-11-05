import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { generateMarketDigest } from '@/lib/marketDigest';
import { draftAutomatedAnnouncement } from '@/lib/automationDraft';

// 60 שניות לא תמיד מספיקות ל-generateMarketDigest (עד 4 סבבי חיפוש אינטרנט אמיתי עם ה-AI) -
// כשזה מתקרב לגבול הישן, הפונקציה הייתה נהרגת באמצע בדיוק ברגע השליחה של התראת הפוש
// (השלב האחרון, אחרי שהטיוטה כבר נשמרה) - זה ההסבר לדפוס החוזר של "הטיוטה נוצרת אבל
// ההתראה לא מגיעה"
export const maxDuration = 300;

// רץ כל בוקר (ראשון-שישי, לא שבת - ר' vercel.json) ומכין סיכום שוק יומי כטיוטה בלבד
// (published=false) - שירן מקבלת התראת פוש, נכנסת ללוח המודעות, בודקת ורק אז לוחצת
// "אישור ופרסום" בעצמה. שום דבר לא מתפרסם או נשלח אוטומטית בלי אישור שלה
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // בודקים אם הכלל כבוי לפני שמריצים חיפוש אינטרנט יקר - אין טעם לשלם על מחקר אם זה
    // ממילא לא יתפרסם
    const { data: rule } = await supabaseAdmin.from('automation_rules').select('enabled').eq('key', 'market-digest').maybeSingle();
    if (rule?.enabled === false) {
      return NextResponse.json({ ok: true, drafted: false, reason: 'disabled' });
    }

    const digest = await generateMarketDigest();
    if ('reason' in digest) {
      console.error('סיכום שוק יומי: אין מספיק מידע מאומת לפרסום היום -', digest.reason);
      return NextResponse.json({ ok: true, drafted: false, reason: 'no_digest', detail: digest.reason });
    }

    const result = await draftAutomatedAnnouncement('market-digest', digest.title, digest.content);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('סיכום שוק יומי: נכשל', e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 });
  }
}
