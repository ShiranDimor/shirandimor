import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { visibleSteps } from '@/lib/tradingPlan/questions';
import { getActiveSubscriberPhoneSet, normalizePhone } from '@/lib/subscriberStatus';

// GET - כל מי שמילא את "תוכנית המסחר", גם מי שהשלים וגם מי שננטש באמצע -
// כדי שיהיה מקום אחד לראות מי חדש (סיים או לא) וליזום קשר עם מי שהשאיר נייד/מייל.
// מנויים פעילים לא מופיעים כאן - זה רשימת "לידים" להמרה, ומנוי כבר המיר. התוכנית שלו/ה
// עדיין נגישה תמיד דרך כפתור "תוכנית מסחר" בעמוד הניהול האישי שלו/ה (/admin/subscribers/[id]).
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: 'לא מחוברים' }, { status: 401 });
  }

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('trading_plan_responses')
    .select('*')
    .in('status', ['in_progress', 'completed'])
    .order('updated_at', { ascending: false })
    .limit(300);

  if (error) {
    return NextResponse.json({ error: 'שגיאה בשליפת נתונים' }, { status: 500 });
  }

  const subscriberPhones = await getActiveSubscriberPhoneSet();
  const leadsOnly = (data || []).filter((r) => !subscriberPhones.has(normalizePhone(r.phone)));

  const rows = leadsOnly.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    source: r.source,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    completed_at: r.completed_at,
    computedProfile: r.computed_profile,
    stepsReached: r.current_step ?? 0,
    totalSteps: visibleSteps(r).length,
    viewed: !!r.admin_viewed_at,
  }));

  return NextResponse.json({ rows });
}
