import { NextResponse } from 'next/server';
import { getMondaySubscriberDetails } from '@/lib/tradingPlan/monday';

// ראוט אבחוני זמני לתיקון תאריכי הצטרפות שהתאפסו בטעות בתקרית הסנכרון - יש למחוק אחרי השימוש.
const TEMP_DEBUG_KEY = 'sync-incident-2026-08-28-x7q2';

export async function GET(request: Request) {
  const key = request.headers.get('x-internal-key');
  if (key !== TEMP_DEBUG_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const details = await getMondaySubscriberDetails();
  return NextResponse.json({ details });
}
