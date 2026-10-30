import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { sendPushToEveryone } from '@/lib/webPush';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// GET - כל ההודעות (כולל לא-מפורסמות) - לתצוגת ניהול
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data, error } = await supabaseAdmin.from('announcements').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'שגיאה בשליפה' }, { status: 500 });

  return NextResponse.json({ announcements: data });
}

// POST - פרסום הודעה חדשה בלוח המודעות - נשלחת כהתראת פוש לכולם (מנויים ולא-מנויים כאחד,
// בלי טשטוש - בניגוד להתראות על עסקאות, כאן שירן ביקשה מפורשות שכולם יקבלו את אותו תוכן)
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { title, content, published } = body as { title?: string; content?: string; published?: boolean };

  if (!title || !content) {
    return NextResponse.json({ error: 'חסרים כותרת או תוכן' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('announcements')
    .insert({ title, content, published: published !== false })
    .select('*')
    .single();

  if (error) {
    console.error('שגיאה בפרסום הודעה', error);
    return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 });
  }

  if (data.published) {
    await sendPushToEveryone({
      title: `📌 ${data.title}`,
      body: data.content.length > 120 ? `${data.content.slice(0, 117)}...` : data.content,
      url: '/announcements',
    });
  }

  return NextResponse.json({ announcement: data });
}
