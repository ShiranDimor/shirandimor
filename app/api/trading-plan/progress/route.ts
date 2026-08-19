import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { classifyProfile } from '@/lib/tradingPlan/profile';
import { getProfileContent } from '@/lib/tradingPlan/profileContent';
import { findOptions } from '@/lib/tradingPlan/questions';

type Outcome = 'followed' | 'broke' | 'no_activity';
type DayStatus = Outcome | 'no_checkin' | 'today_pending' | 'future';

// שולף את התשובה החזקה ביותר לחלום/פחד של האדם, כדי שהתוכנית תמשיך לגעת בהם ולא תישאר כלל יבש וגנרי
function firstLabel(values: unknown, questionId: string): string | null {
  if (!Array.isArray(values) || !values.length) return null;
  return findOptions(questionId, values as string[])[0]?.label || null;
}

function todayIsrael(): string {
  // תאריך "היום" לפי שעון ישראל, כדי שסימון "עשיתי היום" יתאים לאיך שהמשתמש חווה את היום שלו
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

const PROGRAM_LENGTH_DAYS = 30;
const WEEKDAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function dateToIsraelString(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

// יום בשבוע (0=ראשון...6=שבת) מתוך מחרוזת תאריך YYYY-MM-DD, בלי תלות באזור הזמן של השרת
function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

// מי שסווג את עצמו "סווינג" לא נמצא בשוק כל יום - הצ'ק-אין שלו עובר לקצב של פעמיים בשבוע,
// באותם הימים שבהם ממילא נשלחת תזכורת (שני וחמישי) - במקום לשאול אותו "היום" כל יום
function isPeriodicCadence(tradingStyle: string | null | undefined): boolean {
  return tradingStyle === 'swing';
}

function isDueDate(dateStr: string, periodic: boolean): boolean {
  if (!periodic) return true;
  const dow = weekdayOf(dateStr);
  return dow === 1 || dow === 4; // שני, חמישי
}

// בונה את משבצות התוכנית - הימים ה"רלוונטיים" לקצב (כל 30 הימים אם יומי, רק שני/חמישי אם סווינג),
// ובנוסף כל יום שכן דווח בו בפועל - גם אם זה לא יום חובה (למי שרוצה לדווח ביוזמתו על יום שלא היה "תורו")
function buildProgramDays(startDateStr: string, checkinsByDate: Map<string, Outcome>, today: string, periodic: boolean) {
  const start = new Date(`${startDateStr}T00:00:00`);
  const days: { date: string; status: DayStatus }[] = [];

  for (let i = 0; i < PROGRAM_LENGTH_DAYS; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = dateToIsraelString(d);
    if (!isDueDate(dateStr, periodic) && !checkinsByDate.has(dateStr)) continue;

    let status: DayStatus;
    const outcome = checkinsByDate.get(dateStr);
    if (outcome) {
      status = outcome;
    } else if (dateStr > today) {
      status = 'future';
    } else if (dateStr === today) {
      status = 'today_pending';
    } else {
      status = 'no_checkin';
    }

    days.push({ date: dateStr, status });
  }
  return days;
}

// רצף - נשמר על עצם הדיווח הכן בכל יום/ביקורת רלוונטיים, לא רק על הצלחות
function computeStreak(dueDatesSoFarAsc: string[], checkinsByDate: Map<string, Outcome>, today: string): number {
  let idx = dueDatesSoFarAsc.length - 1;
  if (idx >= 0 && dueDatesSoFarAsc[idx] === today && !checkinsByDate.has(today)) idx--;

  let streak = 0;
  while (idx >= 0 && checkinsByDate.has(dueDatesSoFarAsc[idx])) {
    streak++;
    idx--;
  }
  return streak;
}

// GET - נתוני המעקב האישי לפי מזהה תוכנית (רק לתוכניות שהושלמו)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 });

  const { data: row, error } = await supabaseAdmin
    .from('trading_plan_responses')
    .select('*')
    .eq('id', id)
    .eq('status', 'completed')
    .maybeSingle();

  if (error || !row) return NextResponse.json({ error: 'רשומה לא נמצאה' }, { status: 404 });

  const { data: checkins } = await supabaseAdmin
    .from('trading_plan_checkins')
    .select('checkin_date, outcome')
    .eq('response_id', id)
    .order('checkin_date', { ascending: false })
    .limit(60);

  const content = getProfileContent(classifyProfile(row as Record<string, unknown>));
  const rule = row.personal_rule?.trim() ? row.personal_rule : content.defaultRule;
  const today = todayIsrael();

  const dream = firstLabel(row.trading_motivation, 'trading_motivation');
  const fear = firstLabel(row.money_fear, 'money_fear') || firstLabel(row.self_talk, 'self_talk');

  const periodic = isPeriodicCadence(row.trading_style as string | null);
  const checkinsByDate = new Map<string, Outcome>((checkins || []).map((c) => [c.checkin_date, c.outcome as Outcome]));
  const startDateStr = row.completed_at ? dateToIsraelString(new Date(row.completed_at)) : today;
  const programDays = buildProgramDays(startDateStr, checkinsByDate, today, periodic);

  const dueSoFar = programDays.filter((d) => d.status !== 'future').map((d) => d.date);
  const occurrenceNumber = Math.min(programDays.length, Math.max(1, dueSoFar.length));
  const isTodayDue = programDays.some((d) => d.date === today);
  const nextDue = programDays.find((d) => d.date > today);

  return NextResponse.json({
    name: row.name,
    profileTitle: content.title,
    rule,
    dream,
    fear,
    mission: content.mission,
    threeThings: content.threeThings,
    streak: computeStreak(dueSoFar, checkinsByDate, today),
    todayChecked: checkinsByDate.has(today),
    todayOutcome: checkinsByDate.get(today) || null,
    today,
    periodic,
    isTodayDue,
    nextDueDate: nextDue ? nextDue.date : null,
    nextDueWeekday: nextDue ? WEEKDAY_LABELS[weekdayOf(nextDue.date)] : null,
    dayNumber: occurrenceNumber,
    totalDays: programDays.length,
    programDays,
  });
}

// POST - סימון תוצאת היום/הדיווח: עמדתי בכלל / לא עמדתי / לא היה מה לדווח (upsert - גם עריכה של דיווח קיים)
// body: { id: string, outcome: 'followed' | 'broke' | 'no_activity' }
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { id, outcome } = body as { id?: string; outcome?: string };

  if (!id || !['followed', 'broke', 'no_activity'].includes(outcome || '')) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  const { data: row } = await supabaseAdmin.from('trading_plan_responses').select('id').eq('id', id).eq('status', 'completed').maybeSingle();
  if (!row) return NextResponse.json({ error: 'רשומה לא נמצאה' }, { status: 404 });

  const { error } = await supabaseAdmin
    .from('trading_plan_checkins')
    .upsert({ response_id: id, checkin_date: todayIsrael(), outcome }, { onConflict: 'response_id,checkin_date' });

  if (error) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
