import { NextResponse } from 'next/server';
import { getOrComputeMonthlySnapshot } from '@/lib/revenueSnapshot';

// קרון - רץ בתחילת כל חודש (ראה vercel.json) ומחשב ושומר תיעוד של הכנסת קבוצת הסוחרים לחודש
// החדש שהתחיל, בשביל היסטוריה - החישוב עצמו תמיד חי, גם בלי הקרון הזה
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const snapshot = await getOrComputeMonthlySnapshot(true);
  return NextResponse.json({ ok: true, month: snapshot.month, count: snapshot.count, totalAmount: snapshot.totalAmount });
}
