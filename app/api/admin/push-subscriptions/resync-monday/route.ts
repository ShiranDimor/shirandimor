import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { markAppDownloadOnMonday } from '@/lib/tradingPlan/monday';

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

  let fixed = 0;
  let failed = 0;

  for (const sub of subs) {
    const profile = sub.user_id ? profileById.get(sub.user_id) : null;
    const name = profile?.full_name || sub.name;
    const phone = profile?.phone || sub.phone;
    const email = profile?.email || sub.email;
    if (!phone && !email) continue;

    const result = await markAppDownloadOnMonday({ name, phone, email }).catch((e) => ({ ok: false, matched: false, error: e instanceof Error ? e.message : 'threw' }));
    await supabaseAdmin.from('push_subscriptions').update({ monday_sync_error: result.ok ? null : (result.error || 'unknown_error') }).eq('id', sub.id);
    if (result.ok) fixed++; else failed++;
  }

  return NextResponse.json({ ok: true, total: subs.length, fixed, failed });
}
