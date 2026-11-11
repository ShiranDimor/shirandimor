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
    ? await supabaseAdmin.from('notification_receipts').select('notification_log_id').in('notification_log_id', logIds)
    : { data: [] as { notification_log_id: string }[] };

  const confirmedByLog = new Map<string, number>();
  for (const r of receipts || []) {
    confirmedByLog.set(r.notification_log_id, (confirmedByLog.get(r.notification_log_id) || 0) + 1);
  }

  const rows = (logs || []).map((l) => ({ ...l, confirmedCount: confirmedByLog.get(l.id) || 0 }));

  return NextResponse.json({ rows });
}
