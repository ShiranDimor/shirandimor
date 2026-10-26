import { NextResponse } from 'next/server';
import { listBusyIntervals } from '@/lib/googleCalendar';
import { CALL_CONFIG, computeSlots, slotRange } from '@/lib/callSlots';

export const dynamic = 'force-dynamic';

// הזמנים הפנויים לשיחת התאמה, לפי היומן של שירן. אם היומן לא מחובר - available:false והעמוד מציג רק את הטופס.
export async function GET() {
  const { timeMin, timeMax } = slotRange();
  const busy = await listBusyIntervals(timeMin, timeMax);
  if (!busy) {
    return NextResponse.json({ available: false, slots: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json(
    { available: true, minutes: CALL_CONFIG.minutes, slots: computeSlots(busy) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
