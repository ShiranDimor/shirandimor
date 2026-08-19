import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { findCompletedTradingPlanIdByPhone } from '@/lib/subscriberStatus';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// GET - מוצא את תוכנית המסחר שהושלמה עבור מנוי מסוים (לפי הטלפון בפרופיל שלו) - לתצוגת אדמין
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const subscriberId = searchParams.get('subscriberId');
  if (!subscriberId) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 });

  const { data: profile } = await supabaseAdmin.from('profiles').select('phone').eq('id', subscriberId).single();
  const id = await findCompletedTradingPlanIdByPhone(profile?.phone);

  return NextResponse.json({ id });
}
