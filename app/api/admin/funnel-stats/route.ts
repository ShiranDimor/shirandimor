import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

const EVENT_NAMES = [
  'free_group_lead_submitted',
  'whatsapp_group_open_click',
  'trading_plan_started',
  'trading_plan_completed',
  'payment_link_click',
] as const;

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// GET - ספירת אירועי משפך ההמרה, מקובצת לפי סוג אירוע. תומך בסינון טווח זמן: ?since=ISO-date&until=ISO-date
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const since = searchParams.get('since');
  const until = searchParams.get('until');

  let query = supabaseAdmin.from('funnel_events').select('event_name');
  if (since) query = query.gte('created_at', since);
  if (until) query = query.lte('created_at', until);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'שגיאה בשליפת הנתונים' }, { status: 500 });

  const counts: Record<string, number> = Object.fromEntries(EVENT_NAMES.map((e) => [e, 0]));
  for (const row of data || []) {
    if (row.event_name in counts) counts[row.event_name] += 1;
  }

  return NextResponse.json({ counts });
}
