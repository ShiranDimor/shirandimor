import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { findCompletedTradingPlanIdByContact } from '@/lib/subscriberStatus';

// GET - עבור משתמשים מחוברים: מוצא את מזהה תוכנית המסחר שלהם (אם השלימו אחת) לפי הטלפון/מייל בפרופיל.
// דורש session תקף (לא לוקח פרטים מהקליינט - כדי שאי אפשר יהיה "לנחש" תוכנית של מישהו אחר).
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });

  const { data: profile } = await supabaseAdmin.from('profiles').select('phone, email').eq('id', user.id).single();
  const id = await findCompletedTradingPlanIdByContact(profile?.phone, profile?.email);

  return NextResponse.json({ id });
}
