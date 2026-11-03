import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { sendPushToEveryone, sendPushToUser } from '@/lib/webPush';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// POST - שליחה ידנית ומכוונת של התראת פוש על הודעת לוח מודעות קיימת - לכולם, מנויים ולא-
// מנויים כאחד, בלי טשטוש (בניגוד להתראות על עסקאות)
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data: announcement, error } = await supabaseAdmin.from('announcements').select('*').eq('id', params.id).maybeSingle();
  if (error || !announcement) return NextResponse.json({ error: 'ההודעה לא נמצאה' }, { status: 404 });

  // טיוטה (published=false, למשל סיכום שוק יומי שממתין לאישור) לא מופיעה בלוח הציבורי בכלל -
  // קישור לשם היה מראה "ריק" ונראה בטעות כמו הבאג הישן של לוח מודעות קפוא. לטיוטה מפנים
  // לעמוד הניהול, שם היא כן מוצגת (פתוחה, למעלה) עם כפתור "אישור ופרסום"
  const payload = {
    title: `📌 ${announcement.title}`,
    body: announcement.content.length > 120 ? `${announcement.content.slice(0, 117)}...` : announcement.content,
    url: announcement.published ? `/announcements#ann-${params.id}` : '/admin/announcements',
  };

  // בדיקה לעצמי - שולח רק אלי, בלי לגעת ב-notification_sent_at ובלי לרשום ביומן ההתראות
  // (sendPushToUser לא רושם), כדי שהשליחה האמיתית לכולם תישאר זמינה בלי "שהתראה כבר נשלחה"
  const { searchParams } = new URL(request.url);
  if (searchParams.get('test') === '1') {
    const result = await sendPushToUser(admin.id, payload);
    return NextResponse.json({ ok: true, test: true, ...result });
  }

  const result = await sendPushToEveryone(payload, 'announcement', params.id);

  const { data: updated } = await supabaseAdmin
    .from('announcements')
    .update({ notification_sent_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('*')
    .single();

  return NextResponse.json({ announcement: updated || announcement, ...result });
}
