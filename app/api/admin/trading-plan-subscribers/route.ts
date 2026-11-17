import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { getActiveSubscriberContacts, normalizePhone, normalizeEmail } from '@/lib/subscriberStatus';
import { getMondaySubscriberContacts } from '@/lib/tradingPlan/monday';

// GET - מנויים פעילים (גם באתר וגם ב-"קבוצת סוחרים" ב-Monday.com בלבד) שהשלימו את שאלון
// תוכנית המסחר - כדי לראות כמה מהמנויים בפועל משתמשים בכלי, ולתת לשירן קישור ישיר
// לעמוד המעקב האישי של כל אחד מהם.
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: 'לא מחוברים' }, { status: 401 });
  }

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });
  }

  const [{ data, error }, { phones: subscriberPhones, emails: subscriberEmails }, { phones: mondayPhones, emails: mondayEmails }] = await Promise.all([
    supabaseAdmin
      .from('trading_plan_responses')
      .select('id, name, phone, email, computed_profile, completed_at')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(300),
    getActiveSubscriberContacts(),
    getMondaySubscriberContacts(),
  ]);

  if (error) {
    return NextResponse.json({ error: 'שגיאה בשליפת נתונים' }, { status: 500 });
  }

  const subscribersOnly = (data || []).filter(
    (r) =>
      subscriberPhones.has(normalizePhone(r.phone)) ||
      subscriberEmails.has(normalizeEmail(r.email)) ||
      mondayPhones.has(normalizePhone(r.phone)) ||
      mondayEmails.has(normalizeEmail(r.email))
  );

  const rows = subscribersOnly.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    computedProfile: r.computed_profile,
    completed_at: r.completed_at,
  }));

  return NextResponse.json({ rows });
}
