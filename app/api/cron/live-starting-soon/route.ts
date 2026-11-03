import { NextResponse } from 'next/server';
import { runLiveStartingSoonReminder } from '@/lib/automations';

// רץ כל יום ב-16:00 - עוגן קבוע (לא "חצי שעה לפני" מדויק לכל שעה, מגבלת cron יומי בחבילה
// החינמית של Vercel) - ר' lib/automations.ts
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runLiveStartingSoonReminder();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('אוטומציה: תזכורת לייב מתחיל בקרוב - נכשלה', e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 });
  }
}
