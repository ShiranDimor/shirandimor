import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { getOrComputeMonthlySnapshot } from '@/lib/revenueSnapshot';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// GET - תמונת המצב הקבועה של החודש הנוכחי: כמות האנשים שהיו בקבוצת "קבוצת סוחרים" במאנדיי
// ברגע שהחודש הזה התחיל, וסך "עלות חודשית ששילם" שלהם. זה לא משתנה שוב באמצע החודש (בדיוק כמו
// שגרו מאפס את הדוח שלו ב-1 לחודש) - רק בתחילת כל חודש חדש מחושבת תמונה חדשה.
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const forceRecompute = new URL(request.url).searchParams.get('force') === '1';
  const snapshot = await getOrComputeMonthlySnapshot(forceRecompute);
  return NextResponse.json(snapshot);
}
