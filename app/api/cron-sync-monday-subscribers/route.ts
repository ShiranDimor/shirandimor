import { NextResponse } from 'next/server';
import { syncSubscribersBidirectional } from '@/lib/mondaySubscriberSync';

// GET - מופעל ע"י Vercel Cron פעם ביום, סנכרון דו-כיווני מלא מול קבוצת הסוחרים במאנדיי:
// גם מי שקיים רק במאנדיי (למשל שולב ידנית, או מעולם לא נכנס לאתר בעצמו) נספר אוטומטית כמנוי/ה
// פעיל/ה באתר, וגם מי שכבר לא בקבוצה במאנדיי מאבד/ת גישה פעילה באתר אוטומטית תוך 24 שעות -
// בלי שצריך לזכור ללחוץ על "סנכרון מלא" הידני בפאנל הניהול בכל פעם שמישהו מוסר/ת מהקבוצה
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const authHeader = request.headers.get('authorization');
  const providedToken = authHeader?.replace('Bearer ', '') || searchParams.get('token');

  if (providedToken !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await syncSubscribersBidirectional();
  if ('error' in result) {
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
