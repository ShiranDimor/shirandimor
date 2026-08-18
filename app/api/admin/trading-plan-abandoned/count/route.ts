import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

// GET - סך הכל מילאו את השאלון (השלימו + ננטשו באמצע), וכמה מהם עדיין לא נצפו (לא נלחץ עליהם "פרטים מלאים") - לבאדג' בדף הניהול
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
    supabaseAdmin.from('trading_plan_responses').select('id', { count: 'exact', head: true }).in('status', ['in_progress', 'completed']),
    supabaseAdmin.from('trading_plan_responses').select('id', { count: 'exact', head: true }).in('status', ['in_progress', 'completed']).is('admin_viewed_at', null),
  ]);

  return NextResponse.json({ total: total || 0, unread: unread || 0 });
}
