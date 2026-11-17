import { NextResponse } from 'next/server';
import { runSequenceStepsForToday } from '@/lib/sequenceEngine';

// רץ פעם ביום - שולח לכל איש קשר ברצפי הקליטה/טיפוח (ר' lib/sequences.ts) את הצעד הבא שמגיע
// לו/ה היום, אם הגיע הזמן. צעד 0 (מיידי) נשלח ישירות מ-lib/sequenceEngine.ts (startSequence),
// לא דרך הקרון הזה - ר' app/api/webhooks/grow ו-app/api/push/subscribe
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
