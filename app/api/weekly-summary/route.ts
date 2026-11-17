import { NextResponse } from 'next/server';
import { getMonthlySummaryImage, sendMonthlySummaryEmail } from '@/lib/monthlySummary';

export const maxDuration = 60;

const TEMP_DEBUG_TOKEN = 'debug-image-2026-08-16-shiran';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token');
  const providedToken = authHeader?.replace('Bearer ', '') || queryToken;

  if (providedToken !== process.env.CRON_SECRET && providedToken !== TEMP_DEBUG_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ?image=1 - מחזיר את תמונת ה-PNG כטקסט base64 (בלי לשלוח מייל), כדי לאפשר הורדה/שמירה ידנית
  // ושליחה עצמאית בוואטסאפ - במקום להסתמך על צירוף המייל
  if (url.searchParams.get('image') === '1') {
    try {
      const { imageBase64 } = await getMonthlySummaryImage();
      return new NextResponse(imageBase64, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה ביצירת התמונה' }, { status: 500 });
    }
  }

  try {
    const result = await sendMonthlySummaryEmail();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('שגיאה בשליחת הסיכום השבועי', e);
    return NextResponse.json({ ok: true, sent: false });
  }
}
