import { NextResponse } from 'next/server';
import { addMondayUpdate, clean, notifyShiran, sendToMonday } from '@/lib/businessLead';
import { createFitCallEvent, listBookedCallIntervals } from '@/lib/googleCalendar';
import { computeSlots, formatSlotForHumans, slotRange } from '@/lib/callSlots';
import { callManageUrl, newCallEventId } from '@/lib/callManage';
import {
  MENTORING_CALL_MINUTES,
  MENTORING_GROUP_NAME,
  MENTORING_SOURCE_LABEL,
  isMentoringLeadValid,
  mentoringInviteDescription,
  mentoringLeadDetails,
  readMentoringLead,
} from '@/lib/mentoringLead';

export const dynamic = 'force-dynamic';

// קביעת שיחת התאמה לליווי האישי, אחרי שהשאלון כבר נשלח: בודקת שהזמן עדיין פנוי, יוצרת אירוע ביומן של שירן
// (עם זימון לפונה), מוסיפה עדכון לפריט שכבר נוצר במאנדיי בשלב השאלון (או יוצרת חדש אם אין), ושולחת מייל התראה.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  }

  if (clean(body.website, 200)) {
    return NextResponse.json({ ok: true, when: '' });
  }

  const lead = readMentoringLead(body);
  if (!isMentoringLeadValid(lead)) {
    return NextResponse.json({ error: 'חסרים פרטים או תשובות בשאלון' }, { status: 400 });
  }

  const startIso = clean(body.start, 40);
  const start = new Date(startIso);
  if (!startIso || Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: 'לא נבחר זמן לשיחה' }, { status: 400 });
  }

  const { timeMin, timeMax } = slotRange();
  const busy = await listBookedCallIntervals(timeMin, timeMax);
  if (!busy) {
    return NextResponse.json({ error: 'היומן לא זמין כרגע' }, { status: 503 });
  }
  const stillFree = computeSlots(busy, new Date(), MENTORING_CALL_MINUTES).some((s) => new Date(s.start).getTime() === start.getTime());
  if (!stillFree) {
    return NextResponse.json({ error: 'הזמן הזה כבר לא פנוי. בחרו זמן אחר.', taken: true }, { status: 409 });
  }

  const when = formatSlotForHumans(start);
  const leadId = clean(body.leadId, 30);
  // המזהה נקבע מראש כדי שהקישור לשינוי/ביטול ייכנס כבר לתוך הזימון שנשלח למייל
  const plannedId = newCallEventId();
  const manageUrl = callManageUrl(plannedId);
  const eventId = await createFitCallEvent({
    id: plannedId,
    start,
    minutes: MENTORING_CALL_MINUTES,
    summary: `שיחת התאמה לליווי אישי עם שירן דימור | ${lead.name}`,
    description: mentoringInviteDescription(lead.name, lead.phone, manageUrl),
    phone: lead.phone,
    attendeeEmail: lead.email || undefined,
    privateProps: { kind: 'mentoring', name: lead.name, phone: lead.phone, email: lead.email, leadId: /^\d+$/.test(leadId) ? leadId : '' },
  });
  if (!eventId) {
    return NextResponse.json({ error: 'לא הצלחנו לקבוע את השיחה ביומן' }, { status: 502 });
  }

  const bookedLine = `נקבעה שיחת התאמה לליווי אישי: ${when}`;
  const details = mentoringLeadDetails(lead, [bookedLine]);
  const mondayPromise = /^\d+$/.test(leadId)
    ? addMondayUpdate(leadId, bookedLine)
    : sendToMonday(lead as unknown as Record<string, string>, details, {
        groupNames: [MENTORING_GROUP_NAME],
        sourceLabel: MENTORING_SOURCE_LABEL,
        itemName: `${lead.name} - ליווי אישי`,
      });

  await Promise.all([
    Promise.resolve(mondayPromise).catch((e) => console.error('שגיאה בעדכון מאנדיי על שיחת התאמה לליווי אישי', e)),
    notifyShiran(lead as unknown as Record<string, string>, details, `נקבעה שיחת התאמה לליווי אישי: ${lead.name}, ${when}`, 'נקבעה שיחת התאמה מעמוד הליווי האישי.').catch((e) =>
      console.error('שגיאה בשליחת מייל התראה על שיחת התאמה לליווי אישי', e)
    ),
  ]);

  return NextResponse.json({ ok: true, when, start: start.toISOString(), manageUrl });
}
