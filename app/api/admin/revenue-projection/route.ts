import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { getMondaySubscriberDetails } from '@/lib/tradingPlan/monday';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// מחיר החודש הראשון (חודש ההצטרפות עצמו) לעומת חודשים הבאים - ראו app/subscribe/page.tsx
const FIRST_MONTH_PRICE = 200;
const MONTHLY_PRICE = 400;

// גרו מחייבת כל מנוי חודשית ביום-בחודש שבו הוא הצטרף - ואם היום הזה לא קיים בחודש הנוכחי
// (למשל הצטרפות ב-31 לחודש, וחודש נוכחי עם 30 ימים בלבד), ההנחה היא שהחיוב עובר ליום האחרון
// של החודש - מוסכמת חיוב נפוצה, אך כדאי לוודא מול גרו בפועל
function chargeDateThisMonth(startedAt: Date, referenceDate: Date): Date {
  const day = startedAt.getDate();
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDayOfMonth));
}

function isJoinMonth(startedAt: Date, referenceDate: Date): boolean {
  return startedAt.getFullYear() === referenceDate.getFullYear() && startedAt.getMonth() === referenceDate.getMonth();
}

type Charge = { name: string | null; email: string | null; phone: string | null; chargeDate: Date; price: number };

// GET - תמונה מלאה של חיובי החודש: כמה כבר חויב עד היום, וכמה עוד אמור להיות מחויב עד סוף
// החודש. מקור המידע היחיד הוא קבוצת "קבוצת סוחרים" ב-Monday.com (לא מוזג עם חשבונות האתר) -
// כי זה המקום שבו כל מנוי אמיתי קיים תמיד, בין אם יש לו חשבון באתר ובין אם לא (למשל אין לו מייל).
// זה תמיד צפי, לא הבטחה - תלוי שהחיוב בפועל יעבור
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const subscribers = await getMondaySubscriberDetails();

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const charges: Charge[] = [];
  const missingJoinDate: string[] = [];

  for (const s of subscribers) {
    if (!s.joinDate) {
      missingJoinDate.push(s.name || s.phone || s.email || 'ללא שם');
      continue;
    }

    const startedAt = new Date(s.joinDate);
    const monthlyCost = s.monthlyCost ? Number(s.monthlyCost) : null;
    charges.push({
      name: s.name,
      email: s.email,
      phone: s.phone,
      chargeDate: chargeDateThisMonth(startedAt, now),
      price: isJoinMonth(startedAt, now) ? FIRST_MONTH_PRICE : (monthlyCost && !isNaN(monthlyCost) ? monthlyCost : MONTHLY_PRICE),
    });
  }

  const alreadyCharged = charges.filter((c) => c.chargeDate <= today).sort((a, b) => a.chargeDate.getTime() - b.chargeDate.getTime());
  const upcoming = charges.filter((c) => c.chargeDate > today).sort((a, b) => a.chargeDate.getTime() - b.chargeDate.getTime());

  const toResponseItem = (c: Charge) => ({
    name: c.name,
    email: c.email,
    phone: c.phone,
    chargeDate: c.chargeDate.toISOString().slice(0, 10),
    price: c.price,
  });

  return NextResponse.json({
    alreadyCharged: {
      count: alreadyCharged.length,
      totalAmount: alreadyCharged.reduce((sum, c) => sum + c.price, 0),
      items: alreadyCharged.map(toResponseItem),
    },
    upcoming: {
      count: upcoming.length,
      totalAmount: upcoming.reduce((sum, c) => sum + c.price, 0),
      items: upcoming.map(toResponseItem),
    },
    monthTotal: charges.reduce((sum, c) => sum + c.price, 0),
    missingJoinDate,
  });
}
