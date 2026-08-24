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

// GET - כל מי שנרשם ללייב הזה (מנויים ולידים כאחד), למי שמנהלת רוצה לדעת מי מגיע
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('live_registrations')
    .select('id, name, phone, email, is_subscriber, created_at')
    .eq('live_id', params.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'שגיאה בשליפה' }, { status: 500 });

  return NextResponse.json({ registrations: data });
}
