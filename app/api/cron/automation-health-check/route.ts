import { NextResponse } from 'next/server';
import { runAutomationHealthCheck } from '@/lib/automations';

// רץ פעם ביום (ר' vercel.json) ובודק שכל האוטומציה שהייתה אמורה לרוץ היום באמת רצה - אם לא,
// שולח לשירן פוש אחד מרוכז. המטרה: שהיא לא תצטרך לפתוח את /admin/announcements כל יום כדי
// לוודא שהכל עובד - ר' lib/automations.ts: runAutomationHealthCheck להסבר המלא
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runAutomationHealthCheck();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('בדיקת תקינות אוטומציות: נכשלה', e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 });
  }
}
