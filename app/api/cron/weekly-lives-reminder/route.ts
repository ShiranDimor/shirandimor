import { NextResponse } from 'next/server';
import { runWeeklyLivesReminder } from '@/lib/automations';

// רץ כל יום ראשון ב-12:00 - ר' lib/automations.ts
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runWeeklyLivesReminder();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('אוטומציה: תזכורת לייבים שבועית - נכשלה', e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 });
  }
}
