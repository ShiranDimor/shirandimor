import { NextResponse } from 'next/server';
import { addMondayUpdate, clean, notifyShiran } from '@/lib/businessLead';
import { cancelFitCallEvent, getFitCallEvent, listBookedCallIntervals, moveFitCallEvent } from '@/lib/googleCalendar';
import { computeSlots, formatSlotForHumans, slotRange } from '@/lib/callSlots';
import { verifyCallToken } from '@/lib/callManage';
import { MENTORING_CALL_MINUTES } from '@/lib/mentoringLead';

export const dynamic = 'force-dynamic';

// שינוי מועד / ביטול של שיחת התאמה לליווי האישי, דרך הקישור האישי (e = מזהה האירוע, t = חתימה).
// GET - פרטי השיחה הנוכחית. POST {action:'cancel'} או {action:'reschedule', start} - ביצוע + עדכון לשירן.

function deny() {
  return NextResponse.json({ error: 'הקישור לא תקין' }, { status: 403 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('e') || '';
  if (!verifyCallToken(id, searchParams.get('t') || '')) return deny();

  const ev = await getFitCallEvent(id);
  if (!ev || ev.cancelled) return NextResponse.json({ status: 'cancelled' }, { headers: { 'Cache-Control': 'no-store' } });
  const start = new Date(ev.start);
  return NextResponse.json(
    { status: start.getTime() < Date.now() ? 'past' : 'active', start: start.toISOString(), when: formatSlotForHumans(start), name: ev.props.name || '' },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  }
  const id = clean(body.e, 120);
  if (!verifyCallToken(id, clean(body.t, 64))) return deny();

  const ev = await getFitCallEvent(id);
  if (!ev || ev.cancelled) return NextResponse.json({ error: 'השיחה כבר בוטלה' }, { status: 410 });
  const oldWhen = formatSlotForHumans(new Date(ev.start));
  const lead = { name: ev.props.name || '', phone: ev.props.phone || '', email: ev.props.email || '' };
  const contactLines = [`שם: ${lead.name}`, `נייד: ${lead.phone}`, lead.email && `אימייל: ${lead.email}`].filter(Boolean).join('\n');

  if (body.action === 'cancel') {
    if (!(await cancelFitCallEvent(id))) return NextResponse.json({ error: 'הביטול לא הצליח' }, { status: 502 });
    const line = `השיחה בוטלה ע"י הפונה (היה: ${oldWhen})`;
    await Promise.all([
      ev.props.leadId ? addMondayUpdate(ev.props.leadId, line) : Promise.resolve(false),
      notifyShiran(lead, `${line}\n\n${contactLines}`, `בוטלה שיחת התאמה לליווי אישי: ${lead.name}`, 'שיחת התאמה לליווי האישי בוטלה דרך הקישור האישי.').catch(() => false),
    ]);
    return NextResponse.json({ ok: true, status: 'cancelled' });
  }

  if (body.action === 'reschedule') {
    const start = new Date(clean(body.start, 40));
    if (Number.isNaN(start.getTime())) return NextResponse.json({ error: 'לא נבחר זמן' }, { status: 400 });

    const { timeMin, timeMax } = slotRange();
    const busy = await listBookedCallIntervals(timeMin, timeMax);
    if (!busy) return NextResponse.json({ error: 'היומן לא זמין כרגע' }, { status: 503 });
    // השיחה הנוכחית עצמה לא חוסמת את המעבר שלה למועד סמוך
    const ownStart = Date.parse(ev.start);
    const ownEnd = Date.parse(ev.end);
    const others = busy.filter((b) => !(b.start === ownStart && b.end === ownEnd));
    const free = computeSlots(others, new Date(), MENTORING_CALL_MINUTES).some((s) => new Date(s.start).getTime() === start.getTime());
    if (!free) return NextResponse.json({ error: 'הזמן הזה כבר לא פנוי', taken: true }, { status: 409 });

    if (!(await moveFitCallEvent(id, start, MENTORING_CALL_MINUTES))) return NextResponse.json({ error: 'השינוי לא הצליח' }, { status: 502 });
    const when = formatSlotForHumans(start);
    const line = `שיחת ההתאמה הוזזה ע"י הפונה: ${oldWhen} ← ${when}`;
    await Promise.all([
      ev.props.leadId ? addMondayUpdate(ev.props.leadId, line) : Promise.resolve(false),
      notifyShiran(lead, `${line}\n\n${contactLines}`, `שיחת התאמה הוזזה: ${lead.name}, ${when}`, 'שיחת התאמה לליווי האישי הוזזה דרך הקישור האישי.').catch(() => false),
    ]);
    return NextResponse.json({ ok: true, status: 'active', start: start.toISOString(), when });
  }

  return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 });
}
