import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { visibleSteps } from '@/lib/tradingPlan/questions';

// GET - רשימת כל מי שהתחיל למלא את "תוכנית המסחר" ולא סיים (ננטש באמצע),
// כדי שאפשר יהיה ליזום קשר עם מי שהשאיר נייד/מייל
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
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })
    .limit(300);

  if (error) {
    return NextResponse.json({ error: 'שגיאה בשליפת נתונים' }, { status: 500 });
  }

  const rows = (data || []).map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    source: r.source,
    created_at: r.created_at,
    updated_at: r.updated_at,
    stepsReached: r.current_step ?? 0,
    totalSteps: visibleSteps(r).length,
  }));

  return NextResponse.json({ rows });
}
