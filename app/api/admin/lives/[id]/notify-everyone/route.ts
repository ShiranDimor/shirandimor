import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { sendPushToActiveSubscribers, sendPushToNonSubscribers, sendPushToEveryone } from '@/lib/webPush';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  return adminProfile?.role === 'admin' ? user : null;
}

// POST - שליחה רחבה (לא רק לנרשמים בפועל - ר' send-join-link) עם הלינק האמיתי למפגש. לייב
// "פתוח לכולם" - כולם מקבלים את הלינק האמיתי (כל מי שרוצה/ה יכול/ה להצטרף). לייב סגור
// למנויים - רק מנויים מקבלים את הלינק האמיתי, ומי שאינו מנוי מקבל/ת הזמנה להצטרף (חודש ראשון
// ב-₪1) במקום הלינק עצמו - ר' בקשה מפורשת של שירן
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data: live, error } = await supabaseAdmin.from('lives').select('id, title, join_info, scheduled_at, open_to_all').eq('id', params.id).maybeSingle();
  if (error || !live) return NextResponse.json({ error: 'הלייב לא נמצא' }, { status: 404 });
  if (!live.join_info) return NextResponse.json({ error: 'אין קישור הצטרפות שמור למפגש הזה - יש להוסיף אותו קודם בעריכה' }, { status: 400 });

  const dateLabel = new Date(live.scheduled_at).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
  const linkPayload = {
    title: `🎥 הלינק למפגש "${live.title}"`,
    body: `${dateLabel} · לחיצה כאן פותחת ישירות את הפגישה בגוגל מיט`,
    url: live.join_info,
  };

  let result;
  if (live.open_to_all) {
    result = await sendPushToEveryone(linkPayload, 'live', params.id);
  } else {
    const subsResult = await sendPushToActiveSubscribers(linkPayload, 'live', params.id);
    const nonSubsResult = await sendPushToNonSubscribers(
      { title: `🎥 יש לייב - "${live.title}"`, body: `${dateLabel} · פתוח למנויים בלבד - מוזמנ/ת להצטרף, חודש ראשון ב-₪1 ←`, url: '/subscribe' },
      'live',
      params.id
    );
    result = {
      configured: subsResult.configured && nonSubsResult.configured,
      attempted: subsResult.attempted + nonSubsResult.attempted,
      sent: subsResult.sent + nonSubsResult.sent,
      failed: subsResult.failed + nonSubsResult.failed,
      removedStale: subsResult.removedStale + nonSubsResult.removedStale,
    };
  }

  return NextResponse.json({ ok: true, openToAll: live.open_to_all, ...result });
}
