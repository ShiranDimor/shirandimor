import { NextResponse } from 'next/server';
import { syncInstagramInsights } from '@/lib/socialInsights';

export const maxDuration = 60;

// נקרא דרך pg_cron (עם PG_CRON_SECRET) - מושך נתוני חשיפה אורגניים מאינסטגרם לטבלת social_insights
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.PG_CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await syncInstagramInsights()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
