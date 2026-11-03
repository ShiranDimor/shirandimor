import { NextResponse } from 'next/server';
import { runTradesExplanation } from '@/lib/automations';

// רץ בימי שני ורביעי ב-13:00 (לפי התזמון ב-vercel.json) - ר' lib/automations.ts
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runTradesExplanation();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('אוטומציה: הסבר עסקאות פתוחות - נכשלה', e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 });
  }
}
