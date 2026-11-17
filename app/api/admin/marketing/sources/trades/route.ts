import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

function pct(entry: number, exit: number, direction: string) {
  const dirFactor = direction === 'short' ? -1 : 1;
  return ((exit - entry) / entry) * 100 * dirFactor;
}

// GET - עסקאות סגורות בתיק שעדיין אין להן פוסט שיווקי, לבחירה מהירה בסטודיו (בלי חשיפת סכומי כסף)
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data: closedTrades, error } = await supabaseAdmin
    .from('trades')
    .select('id, symbol, direction, entry_price, exit_price, opened_at, closed_at')
    .eq('status', 'closed')
    .not('exit_price', 'is', null)
    .order('closed_at', { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: 'שגיאה בשליפת עסקאות' }, { status: 500 });

  const { data: usedRows } = await supabaseAdmin.from('marketing_posts').select('source_id').eq('source_type', 'trade');
  const usedIds = new Set((usedRows || []).map((r) => r.source_id));

  const available = (closedTrades || [])
    .filter((t) => !usedIds.has(t.id))
    .map((t) => ({
      id: t.id,
      symbol: t.symbol,
      direction: t.direction,
      openedAt: t.opened_at,
      closedAt: t.closed_at,
      pct: Math.round(pct(t.entry_price, t.exit_price, t.direction) * 10) / 10,
    }));

  return NextResponse.json({ trades: available });
}
