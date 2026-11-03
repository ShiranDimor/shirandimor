import { NextResponse } from 'next/server';
import { runLiveTodayReminder } from '@/lib/automations';

// רץ כל יום ב-13:00 - מכין טיוטה רק אם יש לייב היום - ר' lib/automations.ts
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runLiveTodayReminder();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('אוטומציה: תזכורת לייב היום - נכשלה', e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 });
  }
}
