import { NextResponse } from 'next/server';
import { sendWelcomeEmail } from '@/lib/welcomeEmail';

// שליחה ידנית של מייל "ברוכים הבאים" (בדיקה לשירן / מנוי שנרשם לפני שהמייל נבנה). PG_CRON_SECRET
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.PG_CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const u = new URL(request.url);
  const to = u.searchParams.get('to') || '';
  const name = u.searchParams.get('name') || '';
  return NextResponse.json({ ok: await sendWelcomeEmail(to, name), to });
}
