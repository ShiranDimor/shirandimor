import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { sendPushToUser, sendPushToAdmins } from '@/lib/webPush';
import type { MentoringEvent } from '@/lib/mentoring';

// התראות של אזור הליווי האישי, בשני הכיוונים:
// שירן (אדמין) ← תלמיד/ה: פוש + מייל כשיש הערה על עסקה, שיעור חדש, משימה חדשה או משוב על משימה.
// תלמיד/ה ← שירן: פוש לאדמינים + מייל כשנכנסה עסקה חדשה ליומן או שמשימה סומנה כבוצעה.
// הכתיבה עצמה לטבלאות קורית בצד הלקוח (עם RLS) - הנתיב הזה רק מודיע, ותמיד best-effort.

const STUDENT_MESSAGES: Record<string, { title: string; body: string; subject: string }> = {
  trade_reviewed: { title: 'שירן הגיבה על עסקה ביומן 📝', body: 'יש לך הערה חדשה על עסקה - כנס/י לראות', subject: 'הערה חדשה משירן על עסקה ביומן' },
  session_added: { title: 'ההקלטה של השיעור עלתה 🎬', body: 'ההקלטה והסיכום מחכים לך באזור הליווי', subject: 'הקלטת השיעור שלך עלתה' },
  task_added: { title: 'משימה חדשה משירן ✅', body: 'נוספה לך משימה באזור הליווי', subject: 'משימה חדשה בליווי האישי' },
  task_reviewed: { title: 'שירן עברה על המשימה שלך', body: 'יש משוב חדש על משימה - כנס/י לראות', subject: 'משוב על משימה בליווי האישי' },
};

async function sendEmail(to: string, subject: string, text: string, replyTo?: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: 'שירן דימור - ליווי אישי <noreply@shirandimor.com>',
      to,
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      text,
    }),
  }).catch(() => null);
  return !!res?.ok;
}

export async function POST(request: Request) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'לא מחובר/ת' }, { status: 401 });

  const { event, studentId, detail } = (await request.json().catch(() => ({}))) as { event?: MentoringEvent; studentId?: string; detail?: string };
  if (!event) return NextResponse.json({ error: 'חסר סוג אירוע' }, { status: 400 });

  const { data: caller } = await supabaseAdmin.from('profiles').select('role, full_name, email').eq('id', user.id).single();
  const isAdmin = caller?.role === 'admin';
  const url = 'https://shirandimor.com/my-mentoring';

  if (isAdmin && STUDENT_MESSAGES[event]) {
    if (!studentId) return NextResponse.json({ error: 'חסר תלמיד/ה' }, { status: 400 });
    const msg = STUDENT_MESSAGES[event];
    const { data: student } = await supabaseAdmin.from('profiles').select('full_name, email').eq('id', studentId).single();
    const firstName = (student?.full_name || '').trim().split(' ')[0];

    const [push, mail] = await Promise.all([
      sendPushToUser(studentId, { title: msg.title, body: detail ? `${msg.body} · ${detail}` : msg.body, url: '/my-mentoring' }).catch(() => null),
      sendEmail(
        student?.email || '',
        msg.subject,
        `היי${firstName ? ' ' + firstName : ''},\n\n${msg.body}${detail ? `:\n${detail}` : '.'}\n\nלאזור הליווי האישי שלך:\n${url}\n\nשירן`,
        'shiran@shirandimor.com',
      ),
    ]);
    return NextResponse.json({ ok: true, pushSent: push?.sent ?? 0, emailSent: mail });
  }

  if (!isAdmin && (event === 'trade_submitted' || event === 'task_done')) {
    // רק מי שבאמת רשום/ה כתלמיד/ת ליווי יכול/ה להקפיץ התראה לשירן
    const { data: enrolled } = await supabaseAdmin.from('mentoring_students').select('user_id').eq('user_id', user.id).eq('active', true).maybeSingle();
    if (!enrolled) return NextResponse.json({ error: 'אין גישה' }, { status: 403 });

    const name = caller?.full_name || caller?.email || 'תלמיד/ה';
    const title = event === 'trade_submitted' ? `📓 ${name} הוסיף/ה עסקה ליומן` : `✅ ${name} סימן/ה משימה כבוצעה`;
    const body = detail || 'מחכה לניתוח שלך';
    await Promise.all([
      sendPushToAdmins({ title, body, url: `/admin/mentoring?student=${user.id}` }, 'announcement').catch(() => null),
      sendEmail('shiran@shirandimor.com', title, `${body}\n\nלניתוח באזור הניהול:\nhttps://shirandimor.com/admin/mentoring?student=${user.id}`, caller?.email || undefined),
    ]);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'אירוע לא נתמך' }, { status: 400 });
}
