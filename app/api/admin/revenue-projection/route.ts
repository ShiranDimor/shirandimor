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

// המחיר אחרי החודש הראשון (חודש ראשון תמיד ב-200 ש"ח, ולכן לא נכלל בצפי - הוא כבר קרה בהרשמה
// ושירן רואה אותו ישירות מול Grow). ראו app/subscribe/page.tsx לאותו מחיר.
const MONTHLY_PRICE = 400;

// גרו מחייבת כל מנוי חודשית ביום-בחודש שבו הוא הצטרף (subscription_started_at) - ואם היום הזה
// לא קיים בחודש הנוכחי (למשל הצטרפות ב-31 לחודש, וחודש נוכחי עם 30 ימים בלבד), ההנחה היא
// שהחיוב עובר ליום האחרון של החודש - מוסכמת חיוב נפוצה, אך כדאי לוודא מול גרו בפועל
function chargeDateThisMonth(startedAtIso: string, referenceDate: Date): Date {
  const day = new Date(startedAtIso).getDate();
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDayOfMonth));
}

// GET - צפי הכנסה מחיובים שעדיין אמורים לקרות החודש (מחר ועד סוף החודש) - לא כולל את היום
// עצמו, כי חיובי היום כבר נראים ישירות מול Grow. זה תמיד צפי, לא הבטחה - תלוי שהחיוב בפועל יעבור
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data: subscribers, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email, subscription_started_at')
    .eq('role', 'subscriber')
    .eq('subscription_status', 'active')
    .not('subscription_started_at', 'is', null);

  if (error) return NextResponse.json({ error: 'שגיאה בשליפה' }, { status: 500 });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const upcoming = (subscribers || [])
    .map((s) => ({ ...s, chargeDate: chargeDateThisMonth(s.subscription_started_at as string, now) }))
    .filter((s) => s.chargeDate > today)
    .sort((a, b) => a.chargeDate.getTime() - b.chargeDate.getTime());

  return NextResponse.json({
    count: upcoming.length,
    totalAmount: upcoming.length * MONTHLY_PRICE,
    pricePerCharge: MONTHLY_PRICE,
    upcoming: upcoming.map((s) => ({
      name: s.full_name,
      email: s.email,
      chargeDate: s.chargeDate.toISOString().slice(0, 10),
    })),
  });
}
