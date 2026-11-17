import { NextResponse } from 'next/server';
import { runLiveTomorrowReminder } from '@/lib/automations';

// רץ כל יום ב-20:30 - מכין טיוטה רק אם יש לייב מחר - ר' lib/automations.ts
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runLiveTomorrowReminder();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('אוטומציה: תזכורת לייב מחר - נכשלה', e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 });
  }
}
