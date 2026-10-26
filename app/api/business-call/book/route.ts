import { NextResponse } from 'next/server';
import { clean, isLeadValid, leadDetails, notifyShiran, readLead, sendToMonday } from '@/lib/businessLead';
import { createFitCallEvent, listBookedCallIntervals } from '@/lib/googleCalendar';
import { CALL_CONFIG, computeSlots, formatSlotForHumans, slotRange } from '@/lib/callSlots';

export const dynamic = 'force-dynamic';

const BUSINESS_PAGE_URL = 'https://www.shirandimor.com/business';
const WHATSAPP_DISPLAY = '054-716-7419';

// הטקסט שהפונה רואה בזימון ליומן. הוא עוד לא מכיר את שירן, אז מסבירים מי זו ומה השיחה, ומצרפים קישור לעמוד.
function inviteDescription(name: string, org: string, phone: string) {
  return [
    `היי ${name}, תודה על הזמן!`,
    '',
    `זו שיחת היכרות קצרה (כ-15 דקות) עם שירן דימור, על מפגש כסף ושוק ההון לעובדים ב${org}.`,
    `שירן תתקשר אליכם למספר ${phone}.`,
    '',
    'רוצים להציץ לפני השיחה? כל הפרטים כאן:',
    BUSINESS_PAGE_URL,
    '',
    `צריך להזיז את השיחה? אפשר לכתוב לשירן בוואטסאפ: ${WHATSAPP_DISPLAY}`,
    '',
    'שירן דימור | מדברים עסקאות',
  ].join('\n');
}

// קביעת שיחת התאמה מהעמוד לארגונים: בודקת שהזמן עדיין פנוי, יוצרת אירוע ביומן של שירן (עם הזמנה לפונה
// אם השאיר/ה מייל), יוצרת ליד במאנדיי ושולחת מייל התראה.
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

  const lead = readLead(body);
  if (!isLeadValid(lead)) {
    return NextResponse.json({ error: 'חסרים שם, שם הארגון או מספר נייד תקין' }, { status: 400 });
  }

  const startIso = clean(body.start, 40);
  const start = new Date(startIso);
  if (!startIso || Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: 'לא נבחר זמן לשיחה' }, { status: 400 });
  }

  // בדיקה מחדש ברגע הקביעה - כדי שלא ייקבעו שתי שיחות לאותה שעה ושלא יקבעו שעה שלא הוצעה
  const { timeMin, timeMax } = slotRange();
  const busy = await listBookedCallIntervals(timeMin, timeMax);
  if (!busy) {
    return NextResponse.json({ error: 'היומן לא זמין כרגע' }, { status: 503 });
  }
  const stillFree = computeSlots(busy).some((s) => new Date(s.start).getTime() === start.getTime());
  if (!stillFree) {
    return NextResponse.json({ error: 'הזמן הזה כבר לא פנוי. בחרו זמן אחר.', taken: true }, { status: 409 });
  }

  const when = formatSlotForHumans(start);
  const details = leadDetails(lead, [`נקבעה שיחת התאמה טלפונית: ${when}`]);

  const eventId = await createFitCallEvent({
    start,
    minutes: CALL_CONFIG.minutes,
    summary: `שיחת היכרות עם שירן דימור | ${lead.org}`,
    description: inviteDescription(lead.name, lead.org, lead.phone),
    phone: lead.phone,
    attendeeEmail: lead.email || undefined,
  });
  if (!eventId) {
    return NextResponse.json({ error: 'לא הצלחנו לקבוע את השיחה ביומן' }, { status: 502 });
  }

  await Promise.all([
    sendToMonday(lead, details).catch((e) => console.error('שגיאה בשליחת ליד שיחת התאמה ל-Monday.com', e)),
    notifyShiran(lead, details, `נקבעה שיחת התאמה: ${lead.org}, ${when}`).catch((e) =>
      console.error('שגיאה בשליחת מייל התראה על שיחת התאמה', e)
    ),
  ]);

  return NextResponse.json({ ok: true, when });
}
