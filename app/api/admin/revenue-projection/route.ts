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

const DEFAULT_MONTHLY_PRICE = 400;

// מפתח קשר מנורמל - טלפון קודם (רוב המנויים בפועל לא שומרים מייל), עם נפילה חזרה למייל
function contactKeyFor(phone: string | null, email: string | null): string | null {
  if (phone) return `phone:${phone.replace(/\D/g, '').slice(-9)}`;
  if (email) return `email:${email.trim().toLowerCase()}`;
  return null;
}

// GET - תמונת מצב פשוטה: כמות האנשים שנמצאים ממש עכשיו בקבוצת "קבוצת סוחרים" במאנדיי, וסך כל
// "עלות חודשית ששילם" כפי שרשום שם לכל אחד. מי שלא נמצא בקבוצה הזו לא רלוונטי בכלל - אין כאן
// ניחוש לפי תאריכי הרשמה או חודש ראשון/הבא, רק מה שבאמת רשום במאנדיי עכשיו.
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const subscribers = await getMondaySubscriberDetails();

  // כמה אנשים (למשל מי שנרשם בטעות פעמיים) נמצאים בקבוצה עם כרטיס כפול לאותו טלפון/מייל -
  // בפועל זה אותו מנוי אחד, לא שניים - נשאר עם הכרטיס שיש לו את תאריך ההרשמה העדכני יותר
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
  const deduped: typeof subscribers = [...noContact];
  for (const bucket of byContact.values()) {
    if (bucket.length === 1) {
      deduped.push(bucket[0]);
      continue;
    }
    const sorted = [...bucket].sort((a, b) => new Date(b.joinDate || 0).getTime() - new Date(a.joinDate || 0).getTime());
    deduped.push(sorted[0]);
    for (const removed of sorted.slice(1)) {
      duplicatesRemoved.push(`${removed.name || removed.phone || removed.email} (${removed.joinDate || 'ללא תאריך'})`);
    }
  }

  const missingMonthlyCost: string[] = [];
  const items = deduped.map((s) => {
    const monthlyCost = s.monthlyCost ? Number(s.monthlyCost) : null;
    const price = monthlyCost && !isNaN(monthlyCost) ? monthlyCost : DEFAULT_MONTHLY_PRICE;
    if (!monthlyCost || isNaN(monthlyCost)) missingMonthlyCost.push(s.name || s.phone || s.email || 'ללא שם');
    return {
      name: s.name,
      email: s.email,
      phone: s.phone,
      joinDate: s.joinDate,
      price,
    };
  });

  items.sort((a, b) => (b.joinDate || '').localeCompare(a.joinDate || ''));

  return NextResponse.json({
    count: items.length,
    totalAmount: items.reduce((sum, i) => sum + i.price, 0),
    items,
    duplicatesRemoved,
    missingMonthlyCost,
  });
}
