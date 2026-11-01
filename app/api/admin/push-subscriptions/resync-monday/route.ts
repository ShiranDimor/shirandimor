import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { markAppDownloadOnMondayBulk } from '@/lib/tradingPlan/monday';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// POST - תיקון חד-פעמי: עד עכשיו עדכון עמודת "הוריד את האתר" על כרטיס קיים במאנדיי נכשל
// בשקט (change_simple_column_value לא עבד על עמודת status) - כל מי שהפעיל התראות לפני
// התיקון נשאר עם "לא" במאנדיי למרות שבאתר הוא כן מופיע כמופעל. מריץ מחדש את הסנכרון לכל
// המינויים הקיימים, כדי שמאנדיי יתעדכן בלי שכל אחד יצטרך לכבות ולהפעיל שוב בעצמו
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, user_id, name, phone, email');

  if (!subs || subs.length === 0) return NextResponse.json({ ok: true, total: 0, fixed: 0, failed: 0 });

  const userIds = Array.from(new Set(subs.map((s) => s.user_id).filter(Boolean))) as string[];
  const { data: profiles } = userIds.length
    ? await supabaseAdmin.from('profiles').select('id, full_name, phone, email').in('id', userIds)
    : { data: [] as { id: string; full_name: string | null; phone: string | null; email: string | null }[] };
  const profileById = new Map((profiles || []).map((p) => [p.id, p]));

  const resolved = subs.map((sub) => {
    const profile = sub.user_id ? profileById.get(sub.user_id) : null;
    return {
      sub,
      name: profile?.full_name || sub.name,
      phone: profile?.phone || sub.phone,
      email: profile?.email || sub.email,
    };
  });
  const toSync = resolved.filter((r) => r.phone || r.email);

  // markAppDownloadOnMondayBulk סורקת את כל הלוח פעם אחת בלבד (לא פעם לכל מינוי) - מריצים
  // אותה כאן על כולם ביחד במקום בלולאה, אחרת זה לוקח כל כך הרבה זמן שהבקשה נתקעת בדפדפן
  const results = await markAppDownloadOnMondayBulk(toSync.map((r) => ({ name: r.name, phone: r.phone, email: r.email })))
    .catch((e) => toSync.map(() => ({ ok: false, matched: false, error: e instanceof Error ? e.message : 'threw' })));

  let fixed = 0;
  let failed = 0;

  await Promise.all(toSync.map(async (r, i) => {
    const result = results[i];
    await supabaseAdmin.from('push_subscriptions').update({ monday_sync_error: result.ok ? null : (result.error || 'unknown_error') }).eq('id', r.sub.id);
    if (result.ok) fixed++; else failed++;
  }));

  return NextResponse.json({ ok: true, total: subs.length, fixed, failed });
}
