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

  const rows = (subs || []).map((s) => {
    const profile = s.user_id ? profileById.get(s.user_id) : null;
    const isSubscriber = !!profile && (profile.role === 'admin' || (profile.role === 'subscriber' && profile.subscription_status === 'active'));
    return {
      id: s.id,
      createdAt: s.created_at,
      isSubscriber,
      name: profile?.full_name || s.name || null,
      email: profile?.email || s.email || null,
      phone: s.phone || null,
    };
  });

  return NextResponse.json({
    rows,
    subscriberCount: rows.filter((r) => r.isSubscriber).length,
    leadCount: rows.filter((r) => !r.isSubscriber).length,
  });
}

// DELETE - מחיקת מכשיר רשום (לפי id השורה)
export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { id } = await request.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 });

  await supabaseAdmin.from('push_subscriptions').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}
