import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { syncTradingPlanLead } from '@/lib/tradingPlan/monday';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// POST - סנכרון ידני (מחדש) של ליד תוכנית מסחר למאנדיי - לשימוש כשהסנכרון האוטומטי לא קרה
// (למשל אם הבקשה מהדפדפן נקטעה באמצע ברגע שהמשתמש/ת עברו למסך הסיכום). לא יוצר כפילות -
// syncTradingPlanLead בודק קודם אם כבר יש כרטיס עם הטלפון הזה במאנדיי ומעדכן אותו במקום.
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 });
  }

  const { data: row, error } = await supabaseAdmin.from('trading_plan_responses').select('*').eq('id', id).maybeSingle();
  if (error || !row) return NextResponse.json({ error: 'רשומה לא נמצאה' }, { status: 404 });

  const result = await syncTradingPlanLead(row, { completed: row.status === 'completed' });
  if (!result.ok) return NextResponse.json({ error: result.reason || 'שגיאה בסנכרון' }, { status: 500 });

  return NextResponse.json({ ok: true, created: result.created });
}
