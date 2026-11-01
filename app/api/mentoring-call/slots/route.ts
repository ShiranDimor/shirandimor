import { NextResponse } from 'next/server';
import { listBookedCallIntervals } from '@/lib/googleCalendar';
import { computeSlots, slotRange } from '@/lib/callSlots';
import { MENTORING_CALL_MINUTES } from '@/lib/mentoringLead';

export const dynamic = 'force-dynamic';

// זמנים פנויים לשיחת התאמה לליווי האישי. אותו יומן ואותם כללים כמו בעמוד לארגונים (lib/callSlots), כך ששיחה
// שנקבעה מכל אחד מהעמודים חוסמת את הזמן גם בשני. אם היומן לא מחובר - available:false והעמוד מציע וואטסאפ.
export async function GET() {
  const { timeMin, timeMax } = slotRange();
  const busy = await listBookedCallIntervals(timeMin, timeMax);
  if (!busy) {
    // סיבה כללית בלבד (בלי ערכים) - כדי לאבחן מהדפדפן אם חסרים משתני סביבה או שהחיבור לגוגל נכשל
    const configured = ['GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET', 'GOOGLE_CALENDAR_REFRESH_TOKEN'].every((k) => process.env[k]);
    return NextResponse.json(
      { available: false, slots: [], reason: configured ? 'google_connection_failed' : 'calendar_not_configured' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
  return NextResponse.json(
    { available: true, minutes: MENTORING_CALL_MINUTES, slots: computeSlots(busy, new Date(), MENTORING_CALL_MINUTES) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
