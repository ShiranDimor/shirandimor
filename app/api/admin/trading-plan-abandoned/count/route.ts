import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

// GET - סך הכל ננטשו באמצע השאלון, וכמה מהם עדיין לא נצפו (לא נלחץ עליהם "פרטים מלאים") - לבאדג' בדף הניהול
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

  const [{ count: total }, { count: unread }] = await Promise.all([
    supabaseAdmin.from('trading_plan_responses').select('id', { count: 'exact', head: true }).eq('status', 'in_progress'),
    supabaseAdmin.from('trading_plan_responses').select('id', { count: 'exact', head: true }).eq('status', 'in_progress').is('admin_viewed_at', null),
  ]);

  return NextResponse.json({ total: total || 0, unread: unread || 0 });
}
