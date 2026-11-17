import { NextResponse } from 'next/server';
import { checkMetaPublishingSetup } from '@/lib/metaPublish';

// בדיקת מוכנות של חיבור פייסבוק/אינסטגרם לפרסום - לקריאה ידנית (עם PG_CRON_SECRET), בלי לפרסם כלום
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.PG_CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await checkMetaPublishingSetup());
}
