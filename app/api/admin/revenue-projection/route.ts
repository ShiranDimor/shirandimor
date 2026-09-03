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

// GET - הכנסת החודש הנוכחי: כמות האנשים שנמצאים עכשיו בקבוצת "קבוצת סוחרים" במאנדיי וסך
// "עלות חודשית ששילם" שלהם. מחושב חי בכל קריאה כך שהרשמות חדשות באמצע החודש נספרות מיד -
// ה"איפוס" החודשי (בדיוק כמו אצל גרו) קורה אוטומטית כי החישוב משויך תמיד לחודש הנוכחי.
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const forceRecompute = new URL(request.url).searchParams.get('force') === '1';
  const snapshot = await getOrComputeMonthlySnapshot(forceRecompute);
  return NextResponse.json(snapshot);
}
