import { NextResponse } from 'next/server';
import { getOrComputeMonthlySnapshot } from '@/lib/revenueSnapshot';

// קרון - רץ בתחילת כל חודש (ראה vercel.json) ומחשב מיד תמונת מצב חדשה של הכנסה מקבוצת הסוחרים,
// כדי שהיא תהיה מוכנה מהרגע הראשון של החודש ולא תחכה לביקור הראשון של שירן בפאנל הניהול
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const snapshot = await getOrComputeMonthlySnapshot(true);
  return NextResponse.json({ ok: true, month: snapshot.month, count: snapshot.count, totalAmount: snapshot.totalAmount });
}
