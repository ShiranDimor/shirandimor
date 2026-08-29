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

// מפתח קשר מנורמל - טלפון קודם (רוב המנויים בפועל לא שומרים מייל), עם נפילה חזרה למייל
function contactKeyFor(phone: string | null, email: string | null): string | null {
  if (phone) return `phone:${phone.replace(/\D/g, '').slice(-9)}`;
  if (email) return `email:${email.trim().toLowerCase()}`;
  return null;
}

function monthStartISO(referenceDate: Date): string {
  return new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1).toISOString().slice(0, 10);
}

type Charge = { name: string | null; email: string | null; phone: string | null; contactKey: string | null; chargeDate: Date; price: number };

// GET - תמונה מלאה של חיובי החודש: כמה כבר חויב עד היום, וכמה עוד אמור להיות מחויב עד סוף
// החודש. מקור המידע היחיד הוא קבוצת "קבוצת סוחרים" ב-Monday.com (לא מוזג עם חשבונות האתר) -
// כי זה המקום שבו כל מנוי אמיתי קיים תמיד, בין אם יש לו חשבון באתר ובין אם לא (למשל אין לו מייל).
// זה תמיד צפי, לא הבטחה - תלוי שהחיוב בפועל יעבור. אפשר לתקן ידנית פריט בודד (סעיף override) אם
// הצפי האוטומטי לפי תאריך לא תואם את מה שבאמת קרה בפועל.
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const subscribers = await getMondaySubscriberDetails();

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisMonth = monthStartISO(now);

  const { data: overridesRaw } = await supabaseAdmin
    .from('revenue_manual_charges')
    .select('contact_key, charged')
    .eq('month', thisMonth);
  const overrides = new Map((overridesRaw || []).map((o) => [o.contact_key, o.charged]));

  // כמה אנשים (למשל מי שנרשם בטעות פעמיים) נמצאים בקבוצת "קבוצת סוחרים" במאנדיי עם כרטיס
  // כפול לאותו טלפון/מייל, אבל בפועל מחויבים רק פעם אחת בגרו - לכן דוחפים לפי מפתח קשר, ומשאירים
  // רק את הכרטיס עם תאריך ההרשמה החדש ביותר (הכי קרוב למחזור החיוב האמיתי בגרו)
  const byContact = new Map<string, typeof subscribers>();
  const noContact: typeof subscribers = [];
  for (const s of subscribers) {
    const key = contactKeyFor(s.phone, s.email);
    if (!key) {
      noContact.push(s);
      continue;
    }
    const bucket = byContact.get(key) || [];
    bucket.push(s);
    byContact.set(key, bucket);
  }

  const duplicatesRemoved: string[] = [];
  const dedupedSubscribers: typeof subscribers = [...noContact];
  for (const bucket of byContact.values()) {
    if (bucket.length === 1) {
      dedupedSubscribers.push(bucket[0]);
      continue;
    }
    const sorted = [...bucket].sort((a, b) => new Date(b.joinDate || 0).getTime() - new Date(a.joinDate || 0).getTime());
    dedupedSubscribers.push(sorted[0]);
    for (const removed of sorted.slice(1)) {
      duplicatesRemoved.push(`${removed.name || removed.phone || removed.email} (${removed.joinDate || 'ללא תאריך'})`);
    }
  }

  const charges: Charge[] = [];
  const missingJoinDate: string[] = [];

  for (const s of dedupedSubscribers) {
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
      contactKey: contactKeyFor(s.phone, s.email),
      chargeDate: chargeDateThisMonth(startedAt, now),
      price: isJoinMonth(startedAt, now) ? FIRST_MONTH_PRICE : (monthlyCost && !isNaN(monthlyCost) ? monthlyCost : MONTHLY_PRICE),
    });
  }

  // תיקון ידני גובר תמיד על הניחוש האוטומטי לפי תאריך
  const isCharged = (c: Charge) => {
    const manual = c.contactKey ? overrides.get(c.contactKey) : undefined;
    if (manual !== undefined) return manual;
    return c.chargeDate <= today;
  };

  const alreadyCharged = charges.filter(isCharged).sort((a, b) => a.chargeDate.getTime() - b.chargeDate.getTime());
  const upcoming = charges.filter((c) => !isCharged(c)).sort((a, b) => a.chargeDate.getTime() - b.chargeDate.getTime());

  const toResponseItem = (c: Charge) => ({
    name: c.name,
    email: c.email,
    phone: c.phone,
    contactKey: c.contactKey,
    chargeDate: c.chargeDate.toISOString().slice(0, 10),
    price: c.price,
    manuallySet: c.contactKey ? overrides.has(c.contactKey) : false,
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
    duplicatesRemoved,
  });
}

// POST - עדכון ידני של סטטוס חיוב לפריט בודד (בנוסף לניחוש האוטומטי לפי תאריך), לחודש הנוכחי
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { contactKey, charged } = await request.json().catch(() => ({}));
  if (!contactKey || typeof charged !== 'boolean') {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('revenue_manual_charges')
    .upsert({ contact_key: contactKey, month: monthStartISO(new Date()), charged, updated_at: new Date().toISOString() }, { onConflict: 'contact_key,month' });

  if (error) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
