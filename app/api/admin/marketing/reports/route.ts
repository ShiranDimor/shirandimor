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

// GET - דוחות הבקרה היומיים של הסושיאל (נכתבים כל לילה ע"י ריצת הבקרה של Claude)
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('marketing_daily_reports')
    .select('*')
    .order('report_date', { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: 'שגיאה בטעינת הדוחות' }, { status: 500 });
  return NextResponse.json({ reports: data || [] });
}
