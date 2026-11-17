import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { sendPushToContact, normalizePhone, normalizeEmail } from '@/lib/webPush';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  return adminProfile?.role === 'admin' ? user : null;
}

type RegRow = { id: string; name: string | null; phone: string | null; email: string | null; user_id: string | null };

function contactKey(r: RegRow): string {
  if (r.user_id) return `u:${r.user_id}`;
  return `c:${normalizePhone(r.phone)}|${normalizeEmail(r.email)}`;
}

// POST - שליחת הלינק האמיתי להצטרפות (join_info) כהתראת פוש אישית לכל מי שנרשם/ה למפגש הזה -
// גם מנויים וגם לידים עם התראות פעילות (ר' sendPushToContact: שולח לפי user_id אם מחובר/ת,
// אחרת לפי טלפון/מייל גם בלי חשבון). עד עכשיו הלינק האמיתי נמסר רק לרגע ההרשמה עצמו ורק למי
// שזוהה כמנוי/ה - מי שלא היה/הייתה ליד הלינק בכלל, בלי שום דרך אוטומטית להגיע אליו/ה.
// קישור ה-URL בהתראה הוא ה-join_info עצמו (גוגל מיט) - לחיצה על ההתראה פותחת ישירות את
// הפגישה, בלי שלב ביניים
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data: live, error } = await supabaseAdmin.from('lives').select('id, title, join_info, scheduled_at').eq('id', params.id).maybeSingle();
  if (error || !live) return NextResponse.json({ error: 'הלייב לא נמצא' }, { status: 404 });
  if (!live.join_info) return NextResponse.json({ error: 'אין קישור הצטרפות שמור למפגש הזה - יש להוסיף אותו קודם בעריכה' }, { status: 400 });

  const { data: regs } = await supabaseAdmin
    .from('live_registrations')
    .select('id, name, phone, email, user_id')
    .eq('live_id', params.id);

  const byContact = new Map<string, RegRow>();
  for (const r of (regs || []) as RegRow[]) {
    if (!r.user_id && !r.phone && !r.email) continue;
    const key = contactKey(r);
    if (!byContact.has(key)) byContact.set(key, r);
  }

  const dateLabel = new Date(live.scheduled_at).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });

  let sent = 0;
  let failed = 0;
  let removedStale = 0;
  const noPushNames: string[] = [];

  for (const r of byContact.values()) {
    const result = await sendPushToContact(
      { userId: r.user_id, phone: r.phone, email: r.email },
      {
        title: `🎥 הלינק למפגש "${live.title}"`,
        body: `${dateLabel} · לחיצה כאן פותחת ישירות את הפגישה בגוגל מיט`,
        url: live.join_info,
        kind: 'live',
      }
    );
    if (result.attempted === 0) noPushNames.push(r.name || r.phone || r.email || 'ללא שם');
    else {
      sent += result.sent;
      failed += result.failed;
      removedStale += result.removedStale;
    }
  }

  return NextResponse.json({
    ok: true,
    totalRegistrants: byContact.size,
    sent,
    failed,
    removedStale,
    noPushCount: noPushNames.length,
    noPushNames,
  });
}
