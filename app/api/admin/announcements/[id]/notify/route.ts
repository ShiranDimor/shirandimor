import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { sendPushToUser } from '@/lib/webPush';
import { sendAnnouncementNotification } from '@/lib/announcementNotify';

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

  // בדיקה לעצמי - שולח רק אלי, בלי לגעת ב-notification_sent_at ובלי לרשום ביומן ההתראות
  // (sendPushToUser לא רושם), כדי שהשליחה האמיתית לכולם תישאר זמינה בלי "שהתראה כבר נשלחה".
  // טיוטה (published=false) לא מופיעה בלוח הציבורי - לינק הבדיקה מפנה לעמוד הניהול במקום
  const { searchParams } = new URL(request.url);
  if (searchParams.get('test') === '1') {
    const { data: announcement } = await supabaseAdmin.from('announcements').select('title, content, published').eq('id', params.id).maybeSingle();
    if (!announcement) return NextResponse.json({ error: 'ההודעה לא נמצאה' }, { status: 404 });
    const payload = {
      title: `📌 ${announcement.title}`,
      body: announcement.content.length > 120 ? `${announcement.content.slice(0, 117)}...` : announcement.content,
      url: announcement.published ? `/announcements#ann-${params.id}` : '/admin/announcements',
    };
    const result = await sendPushToUser(admin.id, payload);
    return NextResponse.json({ ok: true, test: true, ...result });
  }

  const sent = await sendAnnouncementNotification(params.id);
  if ('error' in sent) return NextResponse.json({ error: sent.error }, { status: 404 });

  return NextResponse.json({ announcement: sent.announcement, ...sent.result });
}
