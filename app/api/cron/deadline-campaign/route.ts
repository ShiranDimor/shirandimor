import { NextResponse } from 'next/server';
import { runDeadlineCampaign } from '@/lib/deadlineCampaign';

export const maxDuration = 60;

// רצף "חודש ראשון ב-₪1 עד 31.12" לנרשמים שאינם מנויים - ר' lib/deadlineCampaign.ts.
// pg_cron כל שעה. ?dry=1 = רק לספור נמענים, בלי לשלוח
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.PG_CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dry') === '1';
  const at = url.searchParams.get('at');
  try {
    return NextResponse.json({ ok: true, ...(await runDeadlineCampaign({ dryRun, now: at && dryRun ? new Date(at) : undefined })) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
