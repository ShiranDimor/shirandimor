import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { normalizePhone } from '@/lib/subscriberStatus';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// GET - רשימת אנשי קשר חסומים
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data, error } = await supabaseAdmin.from('blocked_contacts').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ contacts: data || [] });
}

// POST - חסימת מספר חדש (מונע ממנו להירשם לקבוצת עדכונים/ניסיון/לייבים או לקבל מענה מדור)
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { phone, name, reason } = await request.json().catch(() => ({}));
  const normalized = normalizePhone(phone);
  if (!normalized) return NextResponse.json({ error: 'חסר מספר טלפון תקין' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('blocked_contacts')
    .insert({ phone_normalized: normalized, name: name || null, reason: reason || null })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.code === '23505' ? 'המספר הזה כבר חסום' : error.message }, { status: 500 });

  return NextResponse.json({ contact: data });
}

// DELETE - הסרת חסימה
export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { id } = await request.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 });

  const { error } = await supabaseAdmin.from('blocked_contacts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
