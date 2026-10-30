import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { normalizePhone, normalizeEmail } from '@/lib/subscriberStatus';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// GET - רשימת כל מכשירי ההתראות הרשומים (מנויים ולידים), עם שם/איש קשר לכל אחד - מנוי
// מזוהה דרך הפרופיל שלו (user_id), ליד דרך הפרטים ששמר בעצמו בשורה (name/phone/email)
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, user_id, name, phone, email, created_at')
    .order('created_at', { ascending: false });

  const userIds = Array.from(new Set((subs || []).map((s) => s.user_id).filter(Boolean))) as string[];
  const { data: profiles } = userIds.length
    ? await supabaseAdmin.from('profiles').select('id, full_name, email, role, subscription_status').in('id', userIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null; role: string; subscription_status: string }[] };

  const profileById = new Map((profiles || []).map((p) => [p.id, p]));

  const deviceRows = (subs || []).map((s) => {
    const profile = s.user_id ? profileById.get(s.user_id) : null;
    const isSubscriber = !!profile && (profile.role === 'admin' || (profile.role === 'subscriber' && profile.subscription_status === 'active'));
    return {
      id: s.id,
      createdAt: s.created_at,
      isSubscriber,
      name: profile?.full_name || s.name || null,
      email: profile?.email || s.email || null,
      phone: s.phone || null,
      // מפתח קיבוץ - מנוי לפי user_id, ליד לפי טלפון/מייל מנורמלים (אותו איש קשר ממכשירים
      // שונים צריך להופיע כשורה אחת, לא שורה לכל מכשיר)
      groupKey: s.user_id ? `u:${s.user_id}` : `c:${normalizePhone(s.phone)}|${normalizeEmail(s.email)}`,
    };
  });

  const groups = new Map<string, typeof deviceRows>();
  for (const row of deviceRows) {
    const list = groups.get(row.groupKey) || [];
    list.push(row);
    groups.set(row.groupKey, list);
  }

  const rows = Array.from(groups.values()).map((members) => {
    const sorted = [...members].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const latest = sorted[0];
    return {
      id: latest.id,
      deviceIds: members.map((m) => m.id),
      deviceCount: members.length,
      createdAt: latest.createdAt,
      isSubscriber: latest.isSubscriber,
      name: members.find((m) => m.name)?.name || null,
      email: members.find((m) => m.email)?.email || null,
      phone: members.find((m) => m.phone)?.phone || null,
    };
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({
    rows,
    subscriberCount: rows.filter((r) => r.isSubscriber).length,
    leadCount: rows.filter((r) => !r.isSubscriber).length,
  });
}

// DELETE - מחיקת מכשיר/ים רשומים. מקבל id (שורה בודדת) או ids (כמה שורות בבת אחת - כדי
// להסיר איש קשר אחד שרשום מכמה מכשירים בפעולה אחת)
export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { id, ids } = await request.json().catch(() => ({}));
  const targetIds = Array.isArray(ids) && ids.length ? ids : id ? [id] : [];
  if (!targetIds.length) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 });

  await supabaseAdmin.from('push_subscriptions').delete().in('id', targetIds);
  return NextResponse.json({ ok: true });
}
