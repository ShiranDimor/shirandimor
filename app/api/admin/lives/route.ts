import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { createLiveCalendarEvent } from '@/lib/googleCalendar';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// GET - כל הלייבים (כולל טיוטות ולא-מפורסמים) - לתצוגת ניהול
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('lives')
    .select('*, live_registrations(count)')
    .order('scheduled_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'שגיאה בשליפה' }, { status: 500 });

  const lives = (data || []).map((live) => {
    const { live_registrations, ...rest } = live as typeof live & { live_registrations: { count: number }[] };
    return { ...rest, registrationsCount: live_registrations?.[0]?.count || 0 };
  });

  return NextResponse.json({ lives });
}

// POST - יצירת לייב חדש
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { title, description, scheduledAt, joinInfo, published } = body as Record<string, unknown>;

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'חסרה כותרת' }, { status: 400 });
  }
  if (!scheduledAt || typeof scheduledAt !== 'string' || isNaN(Date.parse(scheduledAt))) {
    return NextResponse.json({ error: 'חסר תאריך/שעה תקינים' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('lives')
    .insert({
      title,
      description: description || null,
      scheduled_at: new Date(scheduledAt).toISOString(),
      join_info: joinInfo || null,
      published: published !== false,
    })
    .select('*')
    .single();

  if (error) {
    console.error('שגיאה ביצירת לייב', error);
    return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 });
  }

  let live = data;

  // אם לא הוזנו ידנית פרטי הצטרפות - יוצרים אוטומטית אירוע ביומן Google של שירן עם קישור Meet,
  // וממלאים אותו כפרטי ההצטרפות של הלייב (עובד רק אם חובר יומן Google, ולא נכשל אם לא)
  if (!joinInfo) {
    const meetLink = await createLiveCalendarEvent(title, (description as string) || null, live.scheduled_at, live.id);
    if (meetLink) {
      const { data: updated } = await supabaseAdmin
        .from('lives')
        .update({ join_info: meetLink })
        .eq('id', live.id)
        .select('*')
        .single();
      if (updated) live = updated;
    }
  }

  // רושמים אוטומטית את המנהלת עצמה כנרשמת ללייב שהיא יצרה
  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('full_name, phone, email').eq('id', admin.id).maybeSingle();
  await supabaseAdmin.from('live_registrations').insert({
    live_id: live.id,
    user_id: admin.id,
    name: adminProfile?.full_name || null,
    phone: adminProfile?.phone || null,
    email: adminProfile?.email || admin.email || null,
    is_subscriber: true,
  });

  return NextResponse.json({ live });
}
