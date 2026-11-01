import { NextResponse } from 'next/server';
import { diagnoseCalendarConnection, listBookedCallIntervals } from '@/lib/googleCalendar';
import { computeSlots, slotRange } from '@/lib/callSlots';
import { MENTORING_CALL_MINUTES } from '@/lib/mentoringLead';

export const dynamic = 'force-dynamic';

// זמנים פנויים לשיחת התאמה לליווי האישי. אותו יומן ואותם כללים כמו בעמוד לארגונים (lib/callSlots), כך ששיחה
// שנקבעה מכל אחד מהעמודים חוסמת את הזמן גם בשני. אם היומן לא מחובר - available:false והעמוד מציע וואטסאפ.
export async function GET() {
  const { timeMin, timeMax } = slotRange();
  const busy = await listBookedCallIntervals(timeMin, timeMax);
  if (!busy) {
    // אבחון (קודי שגיאה של גוגל בלבד, בלי ערכים סודיים) - כדי לדעת מהדפדפן מה בדיוק לתקן
    const diag = await diagnoseCalendarConnection();
    const reason = diag.ok ? 'google_connection_failed' : diag.step === 'config' ? 'calendar_not_configured' : 'google_connection_failed';
    return NextResponse.json(
      { available: false, slots: [], reason, ...(diag.ok ? {} : { step: diag.step, detail: diag.detail }) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
  return NextResponse.json(
    { available: true, minutes: MENTORING_CALL_MINUTES, slots: computeSlots(busy, new Date(), MENTORING_CALL_MINUTES) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
