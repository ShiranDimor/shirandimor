import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { notifyTradesClosed } from '@/lib/tradeClosedAlert';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// POST - נקרא מעמוד ניהול התיק אחרי סגירה ידנית מלאה של עסקה ("⚡ סגירה"), ושולח את מייל
// "עסקה נסגרה" (ברווח / בהפסד) לפי מחיר היציאה שנשמר
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { tradeId } = await request.json().catch(() => ({ tradeId: null }));
  if (!tradeId) return NextResponse.json({ error: 'חסר מזהה עסקה' }, { status: 400 });

  const { data: trade } = await supabaseAdmin
    .from('trades')
    .select('symbol, direction, entry_price, exit_price, status')
    .eq('id', tradeId)
    .single();
  if (!trade || trade.status !== 'closed' || trade.exit_price == null) {
    return NextResponse.json({ error: 'העסקה לא נמצאה או לא סגורה' }, { status: 404 });
  }

  await notifyTradesClosed([
    { symbol: trade.symbol, direction: trade.direction, entry_price: trade.entry_price, exit_price: trade.exit_price },
  ]);
  return NextResponse.json({ success: true });
}
