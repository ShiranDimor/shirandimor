import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

// GET - רשימת הלייבים הקרובים המפורסמים, לתצוגה ציבורית. לא כולל join_info - זה נחשף רק
// אחרי הרשמה בפועל (במסך ההרשמה, או במייל/הודעה שנשלחת לליד).
// אם המשתמש מחובר, גם מסמן אילו לייבים הוא כבר רשום אליהם ומחזיר את viewerIsSubscriber
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  let userId: string | null = null;
  let viewerIsSubscriber = false;

  if (token) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user) {
      userId = user.id;
      const { data: profile } = await supabaseAdmin.from('profiles').select('role, subscription_status').eq('id', user.id).maybeSingle();
      viewerIsSubscriber = profile?.role === 'admin' || (profile?.role === 'subscriber' && profile?.subscription_status === 'active');
    }
  }

  const { data, error } = await supabaseAdmin
    .from('lives')
    .select('id, title, description, scheduled_at, join_info')
    .eq('published', true)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true });

  if (error) return NextResponse.json({ error: 'שגיאה בשליפה' }, { status: 500 });

  let registeredLiveIds = new Set<string>();
  if (userId) {
    const { data: regs } = await supabaseAdmin.from('live_registrations').select('live_id').eq('user_id', userId);
    registeredLiveIds = new Set((regs || []).map((r) => r.live_id));
  }

  const lives = (data || []).map((l) => {
    const registered = registeredLiveIds.has(l.id);
    return {
      id: l.id,
      title: l.title,
      description: l.description,
      scheduledAt: l.scheduled_at,
      // join_info נחשף רק למי שבאמת רשום, ורק אם הוא מנוי (מי שהשאיר פרטים כליד מקבל את זה בנפרד מהצוות)
      joinInfo: registered && viewerIsSubscriber ? l.join_info : null,
      registered,
    };
  });

  return NextResponse.json({ lives, viewerIsSubscriber });
}
