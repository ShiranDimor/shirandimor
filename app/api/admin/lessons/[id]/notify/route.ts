import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { sendPushToActiveSubscribers, sendPushToNonSubscribers, sendPushToEveryone } from '@/lib/webPush';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// POST - שליחה ידנית ומכוונת של התראת פוש על שיעור קיים - נפרד לגמרי משמירה/עריכה, כדי שעריכת
// כותרת או תוכן לא תשלח התראה בטעות. שיעור "למנויים" מתריע עם הכותרת המלאה רק למנויים, ולמי
// שאינו מנוי מגיעה גרסה כללית + קריאה להצטרפות. שיעור "ציבורי"/"לרשומים" פתוח ממילא, אז כולם
// מקבלים את אותה התראה מלאה
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data: lesson, error } = await supabaseAdmin.from('lessons').select('*').eq('id', params.id).maybeSingle();
  if (error || !lesson) return NextResponse.json({ error: 'השיעור לא נמצא' }, { status: 404 });

  const lessonUrl = '/lessons';
  if (lesson.tier === 'subscriber') {
    await sendPushToActiveSubscribers({ title: `📚 שיעור חדש - ${lesson.title}`, body: 'נוסף לספריית השיעורים', url: lessonUrl });
    await sendPushToNonSubscribers({ title: '📚 שיעור חדש בספרייה', body: 'שיעור חדש למנויים - 7 ימי ניסיון ללא עלות ←', url: '/trial' });
  } else {
    await sendPushToEveryone({ title: `📚 שיעור חדש - ${lesson.title}`, body: 'נוסף לספריית השיעורים', url: lessonUrl });
  }

  const { data: updated } = await supabaseAdmin
    .from('lessons')
    .update({ notification_sent_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('*')
    .single();

  return NextResponse.json({ lesson: updated || lesson });
}
