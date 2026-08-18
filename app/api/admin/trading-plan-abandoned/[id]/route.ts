import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { ALL_QUESTIONS, findOption, findOptions } from '@/lib/tradingPlan/questions';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// GET - כל התשובות שהוזנו עד כה לרשומה ספציפית (גם אם עדיין לא הושלמה), עם תוויות קריאות
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data: row, error } = await supabaseAdmin
    .from('trading_plan_responses')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: 'רשומה לא נמצאה' }, { status: 404 });
  }

  if (!row.admin_viewed_at) {
    await supabaseAdmin.from('trading_plan_responses').update({ admin_viewed_at: new Date().toISOString() }).eq('id', params.id);
  }

  const answers = ALL_QUESTIONS
    .filter((q) => {
      const v = (row as Record<string, unknown>)[q.id];
      return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
    })
    .map((q) => {
      const raw = (row as Record<string, unknown>)[q.id];
      let value: string;
      if (q.type === 'multi') {
        const labels = findOptions(q.id, raw as string[]).map((o) => o.label);
        value = labels.length ? labels.join(', ') : (Array.isArray(raw) ? raw.join(', ') : String(raw));
      } else if (q.options) {
        value = findOption(q.id, raw as string)?.label || String(raw);
      } else {
        value = String(raw);
      }
      return { id: q.id, title: q.title, value };
    });

  return NextResponse.json({ row, answers });
}

// DELETE - מחיקת רשומה שננטשה (מוגבל בכוונה לרשומות שעדיין לא הושלמו - לא ניתן למחוק דרך המסך הזה תוכנית שכבר נשלחה)
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { error } = await supabaseAdmin
    .from('trading_plan_responses')
    .delete()
    .eq('id', params.id)
    .eq('status', 'in_progress');

  if (error) {
    return NextResponse.json({ error: 'שגיאה במחיקה' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
