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

// PATCH - הפעלה/כיבוי כלל אוטומציה בודד
export async function PATCH(request: Request, { params }: { params: { key: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { enabled } = await request.json().catch(() => ({}));
  if (typeof enabled !== 'boolean') return NextResponse.json({ error: 'חסר enabled' }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('automation_rules').update({ enabled }).eq('key', params.key).select('*').single();
  if (error) return NextResponse.json({ error: 'שגיאה בעדכון' }, { status: 500 });

  return NextResponse.json({ rule: data });
}
