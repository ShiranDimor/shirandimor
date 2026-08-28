import { NextResponse } from 'next/server';
import { isContactInSubscribersGroupMonday } from '@/lib/tradingPlan/monday';

// ראוט אבחוני זמני - בדיקת התאמה נקודתית מול קבוצת הסוחרים במאנדיי, לאבחון כשל התחברות של יוסי רכמן. יש למחוק אחרי השימוש.
const TEMP_DEBUG_KEY = 'sync-incident-2026-08-28-x7q2';

export async function GET(request: Request) {
  const key = request.headers.get('x-internal-key');
  if (key !== TEMP_DEBUG_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone');
  const email = searchParams.get('email');

  const found = await isContactInSubscribersGroupMonday(phone, email);
  return NextResponse.json({ phone, email, found });
}
