import { NextResponse } from 'next/server';
import { syncMetaLeadsToMonday } from '@/lib/metaLeadsToMonday';

export const maxDuration = 60;

// נקרא דרך pg_cron (עם PG_CRON_SECRET) - משלים בכרטיסי מאנדיי את מה שהחיבור המובנה של מאנדיי
// למטא לא מעביר (תשובות בטופס, שם המודעה, פלטפורמה). ?dry=1 = רק לבדוק מה היה משתנה
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.PG_CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dry = new URL(request.url).searchParams.get('dry') === '1';
  try {
    return NextResponse.json({ ok: true, ...(await syncMetaLeadsToMonday(dry)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
