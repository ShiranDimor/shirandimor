import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { sendMonthlySummaryEmail } from '@/lib/monthlySummary';

export const maxDuration = 60;

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// POST - שליחה ידנית של סיכום החודש למייל, בלחיצת כפתור מעמוד הניהול - בדיוק אותה שליחה
// שקורית אוטומטית ב-cron, רק על-פי דרישה. month אופציונלי בפורמט "YYYY-MM" - לבחירת חודש
// אחר מהחודש הנוכחי (למשל ב-1 באוקטובר לשלוח את סיכום ספטמבר)
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const monthParam = typeof body?.month === 'string' ? body.month : null;
  const match = monthParam?.match(/^(\d{4})-(\d{2})$/);
  const targetMonth = match ? { year: Number(match[1]), month: Number(match[2]) - 1 } : undefined;

  try {
    const result = await sendMonthlySummaryEmail(targetMonth);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בשליחת הסיכום' }, { status: 500 });
  }
}
