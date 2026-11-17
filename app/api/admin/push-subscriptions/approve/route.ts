import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { ensureActiveSubscriberAccount, normalizePhone, normalizeEmail } from '@/lib/subscriberStatus';
import { moveContactToSubscribersGroupOnMonday } from '@/lib/tradingPlan/monday';

// מחיר החודש הראשון (₪1) - מי שמאושר/ת מכאן שילם/ה את מחיר הכניסה הסמלי
const APPROVED_MONTHLY_PRICE = 1;

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// POST - "אישור כמנוי" לליד ברשימת ההתראות. קורה כשמישהו/י שילם/ה אבל הפעיל/ה התראות כאורח/ת
// לפני שהתחבר/ה (ולכן אין לו/ה חשבון באתר, וכרטיס המאנדיי עבר ל"הפעיל עדכונים באתר ללא מנוי").
// (1) יוצר/משדרג חשבון מנוי פעיל עם אותה ensureActiveSubscriberAccount שכל שאר האתר משתמש בה,
// (2) מקשר את המכשירים הרשומים לחשבון כדי שיקבלו מעכשיו התראות מלאות של מנוי,
// (3) מעביר את הכרטיס במאנדיי ל"קבוצת סוחרים" - אחרת הסנכרון היומי היה מבטל את האישור.
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { ids } = await request.json().catch(() => ({}));
  if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 });

  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, user_id, name, phone, email, created_at')
    .in('id', ids);
  if (!subs || !subs.length) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });

  const name = subs.find((s) => s.name)?.name?.trim() || '';
  const phone = subs.find((s) => s.phone)?.phone?.trim() || '';
  const email = subs.find((s) => s.email)?.email?.trim().toLowerCase() || '';

  if (!email && !phone) return NextResponse.json({ error: 'אין טלפון או מייל לאיש הקשר הזה' }, { status: 400 });

  // תאריך ההרשמה = היום שבו הפעיל/ה לראשונה התראות באתר (המכשיר הראשון), לא יום האישור.
  // התאריך קובע את יום החיוב החודשי, לכן נשמר גם בפרופיל וגם במאנדיי. תאריך מאנדיי לפי שעון ישראל
  const registeredAt = subs.map((s) => s.created_at).sort()[0] || new Date().toISOString();
  const joinDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(registeredAt));

  try {
    await ensureActiveSubscriberAccount(email, phone, name || email || phone, registeredAt, true, APPROVED_MONTHLY_PRICE);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה ביצירת החשבון' }, { status: 500 });
  }

  // מאתרים את הפרופיל שנוצר/עודכן - טלפון קודם (כמו ב-ensureActiveSubscriberAccount), מייל כגיבוי
  let profileId: string | null = null;
  const normPhone = normalizePhone(phone);
  if (normPhone) {
    const { data: withPhone } = await supabaseAdmin.from('profiles').select('id, phone').not('phone', 'is', null);
    profileId = (withPhone || []).find((p) => normalizePhone(p.phone) === normPhone)?.id || null;
  }
  if (!profileId && email) {
    const { data: byEmail } = await supabaseAdmin.from('profiles').select('id').eq('email', normalizeEmail(email)).maybeSingle();
    profileId = byEmail?.id || null;
  }

  if (profileId) {
    await supabaseAdmin.from('push_subscriptions').update({ user_id: profileId }).in('id', subs.map((s) => s.id));
  }

  const monday = await moveContactToSubscribersGroupOnMonday({ name, phone, email, joinDate, monthlyCost: APPROVED_MONTHLY_PRICE });

  return NextResponse.json({ ok: true, userId: profileId, mondayOk: monday.ok, mondayError: monday.error || null });
}
