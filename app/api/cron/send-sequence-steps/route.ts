import { NextResponse } from 'next/server';
import { runSequenceStepsForToday } from '@/lib/sequenceEngine';

// רץ כל 15 דקות (pg_cron, לא ה-cron המובנה של Vercel - ר' הערה דומה ב-check-grow-emails) -
// שולח לכל איש קשר ברצפי הקליטה/טיפוח (ר' lib/sequences.ts) את הצעד הבא שמגיע לו/ה, אם הגיע
// הזמן. תדירות גבוהה נדרשת כדי לתפוס את חלון ההמתנה של 30 דקות לצעד הראשון (ר' lib/sequenceEngine.ts)
// בזמן סביר - קרון יומי היה אומר שמישהו/י שמפעיל/ה התראות 31 דקות אחרי ההרשמה מחכה/ת עד למחרת
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.PG_CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runSequenceStepsForToday();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('רצפי קליטה/טיפוח: הרצה יומית נכשלה', e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 });
  }
}
