import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// GET - היסטוריית ההתראות האחרונות, עם confirmedCount אמיתי לצד sent_count הקיים - ההבדל
// בין השניים הוא בדיוק הפער בין "שירות הפוש הסכים לקבל" לבין "המכשיר באמת הציג" (ר'
// public/sw.js ו-/api/push/receipt). לא confirmedCount==sent_count זה לא תמיד תקלה - זה
// יכול להיות גם מכשיר כבוי/לא מחובר לרשת כרגע, לא רק שבור
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data: logs, error } = await supabaseAdmin
    .from('notification_log')
    .select('id, kind, audience, title, body, created_at, sent_count, failed_count, removed_stale_count, configured')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: 'שגיאה בטעינת ההיסטוריה' }, { status: 500 });

  const logIds = (logs || []).map((l) => l.id);
  const { data: receipts } = logIds.length
    ? await supabaseAdmin.from('notification_receipts').select('notification_log_id, push_subscription_id').in('notification_log_id', logIds)
    : { data: [] as { notification_log_id: string; push_subscription_id: string }[] };

  const subIds = Array.from(new Set((receipts || []).map((r) => r.push_subscription_id)));
  const { data: subs } = subIds.length
    ? await supabaseAdmin.from('push_subscriptions').select('id, user_id, phone, email').in('id', subIds)
    : { data: [] as { id: string; user_id: string | null; phone: string | null; email: string | null }[] };
  const subById = new Map((subs || []).map((s) => [s.id, s]));

  // סופרים לפי אדם, לא לפי מכשיר - אותו עיקרון כמו sent_count ב-lib/webPush.ts, כדי ששני
  // המספרים (נשלח/אושר) יספרו את אותה אוכלוסייה ואפשר יהיה להשוות ביניהם ישירות
  const confirmedRecipientsByLog = new Map<string, Set<string>>();
  for (const r of receipts || []) {
    const sub = subById.get(r.push_subscription_id);
    const key = sub?.user_id
      ? `u:${sub.user_id}`
      : `c:${(sub?.phone || '').replace(/\D/g, '').slice(-9)}|${(sub?.email || '').trim().toLowerCase()}`;
    const set = confirmedRecipientsByLog.get(r.notification_log_id) || new Set<string>();
    set.add(key);
    confirmedRecipientsByLog.set(r.notification_log_id, set);
  }

  const rows = (logs || []).map((l) => ({ ...l, confirmedCount: confirmedRecipientsByLog.get(l.id)?.size || 0 }));

  return NextResponse.json({ rows });
}
