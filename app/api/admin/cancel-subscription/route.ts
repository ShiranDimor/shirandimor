import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

// POST - ביטול מנוי ידני: מוריד role מ-"subscriber" ל-"lead" ומאבד גישה מיידית
// (לא מוחק חשבון/נתונים - למחיקה מלאה יש כפתור נפרד)
// body: { userId: string }
export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'לא מחוברים' }, { status: 401 });

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { userId } = await request.json().catch(() => ({}));
  if (!userId) return NextResponse.json({ error: 'חסר מזהה משתמש' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ role: 'lead', subscription_status: 'cancelled' })
    .eq('id', userId);

  if (error) return NextResponse.json({ error: 'שגיאה בביטול המנוי' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
