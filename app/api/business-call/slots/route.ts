import { NextResponse } from 'next/server';
import { listBookedCallIntervals } from '@/lib/googleCalendar';
import { CALL_CONFIG, computeSlots, slotRange } from '@/lib/callSlots';

export const dynamic = 'force-dynamic';

// הזמנים הפנויים לשיחת התאמה: רק שיחות שכבר נקבעו מהעמוד חוסמות זמן (אירועים אישיים ביומן לא). אם היומן לא מחובר - available:false והעמוד מציג רק את הטופס.
export async function GET() {
  const { timeMin, timeMax } = slotRange();
  const busy = await listBookedCallIntervals(timeMin, timeMax);
  if (!busy) {
    return NextResponse.json({ available: false, slots: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json(
    { available: true, minutes: CALL_CONFIG.minutes, slots: computeSlots(busy) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
