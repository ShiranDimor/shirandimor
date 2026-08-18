import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { classifyProfile } from '@/lib/tradingPlan/profile';
import { getProfileContent } from '@/lib/tradingPlan/profileContent';

function todayIsrael(): string {
  // תאריך "היום" לפי שעון ישראל, כדי שסימון "עשיתי היום" יתאים לאיך שהמשתמש חווה את היום שלו
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function computeStreak(checkinDates: string[]): number {
  const set = new Set(checkinDates);
  let streak = 0;
  const cursor = new Date(todayIsrael());

  // אם היום עוד לא סומן - הרצף נספר עד אתמול (לא שובר את הרצף רק כי עוד לא הגיע הזמן היום)
  if (!set.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
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
    .select('checkin_date, followed_rule')
    .eq('response_id', id)
    .order('checkin_date', { ascending: false })
    .limit(60);

  const content = getProfileContent(classifyProfile(row as Record<string, unknown>));
  const rule = row.personal_rule?.trim() ? row.personal_rule : content.defaultRule;
  const dates = (checkins || []).map((c) => c.checkin_date);

  return NextResponse.json({
    name: row.name,
    rule,
    mission: content.mission,
    threeThings: content.threeThings,
    checkins: checkins || [],
    streak: computeStreak(dates),
    todayChecked: dates.includes(todayIsrael()),
    today: todayIsrael(),
  });
}

// POST - סימון "עמדתי/לא עמדתי בכלל" להיום
// body: { id: string, followedRule: boolean }
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { id, followedRule } = body as { id?: string; followedRule?: boolean };

  if (!id || typeof followedRule !== 'boolean') {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  const { data: row } = await supabaseAdmin.from('trading_plan_responses').select('id').eq('id', id).eq('status', 'completed').maybeSingle();
  if (!row) return NextResponse.json({ error: 'רשומה לא נמצאה' }, { status: 404 });

  const { error } = await supabaseAdmin
    .from('trading_plan_checkins')
    .upsert({ response_id: id, checkin_date: todayIsrael(), followed_rule: followedRule }, { onConflict: 'response_id,checkin_date' });

  if (error) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
