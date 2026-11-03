import { NextResponse } from 'next/server';
import { runNewLessonAnnouncement } from '@/lib/automations';

// רץ כל בוקר ב-9:00, בודק שיעורים שעלו אתמול (לא מיד עם ההעלאה) ומכין טיוטה - ר' lib/automations.ts
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runNewLessonAnnouncement();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('אוטומציה: הודעה על שיעור חדש - נכשלה', e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 });
  }
}
