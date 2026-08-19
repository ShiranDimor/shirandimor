import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { findCompletedTradingPlanIdByPhone } from '@/lib/subscriberStatus';

// GET - עבור משתמש/ת מחוברים: מוצא את מזהה תוכנית המסחר שלהם (אם השלימו אחת) לפי הטלפון בפרופיל.
// דורש session תקף (לא לוקח טלפון מהקליינט - כדי שאי אפשר יהיה "לנחש" תוכנית של מישהו אחר).
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });

  const { data: profile } = await supabaseAdmin.from('profiles').select('phone').eq('id', user.id).single();
  const id = await findCompletedTradingPlanIdByPhone(profile?.phone);

  return NextResponse.json({ id });
}
