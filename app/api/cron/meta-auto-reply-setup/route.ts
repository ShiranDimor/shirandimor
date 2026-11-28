import { NextResponse } from 'next/server';
import { setupStatus } from '@/lib/metaAutoReply';

// בדיקה (ועם ?subscribe=1 גם רישום העמוד לאירועי הודעות/תגובות) של המענה האוטומטי "בא לי". קריאה ידנית עם PG_CRON_SECRET
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.PG_CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const subscribe = new URL(request.url).searchParams.get('subscribe') === '1';
  return NextResponse.json(await setupStatus(subscribe));
}
