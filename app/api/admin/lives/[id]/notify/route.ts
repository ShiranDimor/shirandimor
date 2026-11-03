import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { sendPushToActiveSubscribers, sendPushToNonSubscribers, sendPushToEveryone, sendPushToUser } from '@/lib/webPush';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// POST - שליחה ידנית ומכוונת של התראת פוש על לייב קיים - נפרד לגמרי משמירה/עריכה. לייב "פתוח
// לכולם" מתריע לכולם עם כל הפרטים; לייב סגור למנויים מתריע למנויים עם הפרטים המלאים, ולמי
// שאינו מנוי מגיעה גרסה כללית + קריאה להצטרפות
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data: live, error } = await supabaseAdmin.from('lives').select('*').eq('id', params.id).maybeSingle();
  if (error || !live) return NextResponse.json({ error: 'הלייב לא נמצא' }, { status: 404 });

  // timeZone מפורש חובה כאן - זה רץ על השרת (Vercel, UTC) ולא בדפדפן של מישהו בישראל, אז בלי
  // זה ה-02:00- של ישראל "נבלע" וההתראה מציגה שעה מוקדמת ב-2/3 שעות ממה שבאמת נקבע
  const dateLabel = new Date(live.scheduled_at).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });

  // בדיקה לעצמי - שולח רק אלי (בגרסת "המנויים", כולל כל הפרטים), בלי לגעת ב-notification_sent_at
  // כדי שהשליחה האמיתית לכולם תישאר זמינה בלי "שהתראה כבר נשלחה"
  const { searchParams } = new URL(request.url);
  if (searchParams.get('test') === '1') {
    const result = await sendPushToUser(admin.id, { title: `🎥 מפגש חדש - ${live.title}`, body: dateLabel, url: '/lives' });
    return NextResponse.json({ ok: true, test: true, ...result });
  }

  if (live.open_to_all) {
    await sendPushToEveryone({ title: `🎥 מפגש חדש - ${live.title}`, body: dateLabel, url: '/lives' }, 'live', params.id);
  } else {
    await sendPushToActiveSubscribers({ title: `🎥 מפגש חדש - ${live.title}`, body: dateLabel, url: '/lives' }, 'live', params.id);
    await sendPushToNonSubscribers({ title: '🎥 נקבע מפגש חדש', body: 'פתוח למנויים - חודש ראשון ב-₪1 ←', url: '/subscribe' }, 'live', params.id);
  }

  const { data: updated } = await supabaseAdmin
    .from('lives')
    .update({ notification_sent_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('*')
    .single();

  return NextResponse.json({ live: updated || live });
}
