import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { normalizePhone, normalizeEmail } from '@/lib/subscriberStatus';
import { listPushActivatedNoSubContacts, markPushDisabledOnMonday } from '@/lib/tradingPlan/monday';

// ניקוי במאנדיי יכול לקחת זמן (סריקת כל הלוח + מוטציה לכל כרטיס שצריך להעביר)
export const maxDuration = 300;

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// POST - ניקוי חד-פעמי: קבוצת "הפעיל עדכונים באתר ללא מנוי" במאנדיי רק גדלה עם הזמן (ר'
// markAppDownloadOnMonday) - עד עכשיו שום דבר לא העביר החוצה מי שכיבה/תה את ההתראות בפועל
// (ר' markPushDisabledOnMonday, שמטפל בזה רק מעכשיו והלאה). עובר על כל מי שנמצא/ת בקבוצה
// הזו *עכשיו*, בודק מול הטבלה שלנו אם יש לו/ה עדיין מכשיר תקף כלשהו, ומעביר ל"לידים חדשים"
// את מי שאין לו/ה - בלי לגעת במי שעדיין באמת מקבל/ת מאיתנו עדכונים
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const contacts = await listPushActivatedNoSubContacts();
  if (contacts.length === 0) return NextResponse.json({ ok: true, checked: 0, moved: 0, stillValid: 0, errors: [] });

  // כל המכשירים התקפים כרגע (לא רק לידים בלי חשבון - גם מחוברים/ות עם user_id, שהטלפון/מייל
  // שלהם נמצא בפרופיל ולא בשורת המינוי עצמה)
  const { data: validSubs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('user_id, phone, email')
    .is('invalid_at', null);

  const userIds = Array.from(new Set((validSubs || []).map((s) => s.user_id).filter(Boolean))) as string[];
  const { data: profiles } = userIds.length
    ? await supabaseAdmin.from('profiles').select('id, phone, email').in('id', userIds)
    : { data: [] as { id: string; phone: string | null; email: string | null }[] };
  const profileById = new Map((profiles || []).map((p) => [p.id, p]));

  const validPhones = new Set<string>();
  const validEmails = new Set<string>();
  for (const sub of validSubs || []) {
    const profile = sub.user_id ? profileById.get(sub.user_id) : null;
    const phone = profile?.phone || sub.phone;
    const email = profile?.email || sub.email;
    if (phone) validPhones.add(normalizePhone(phone));
    if (email) validEmails.add(normalizeEmail(email));
  }

  let moved = 0;
  let stillValid = 0;
  const errors: string[] = [];

  for (const contact of contacts) {
    const phone = contact.phone ? normalizePhone(contact.phone) : null;
    const email = contact.email ? normalizeEmail(contact.email) : null;
    const isStillReachable = (!!phone && validPhones.has(phone)) || (!!email && validEmails.has(email));

    if (isStillReachable) {
      stillValid++;
      continue;
    }

    const result = await markPushDisabledOnMonday({ phone: contact.phone, email: contact.email }).catch((e) => ({ ok: false, moved: false, error: e instanceof Error ? e.message : 'threw' }));
    if (result.ok && result.moved) moved++;
    else if (!result.ok) errors.push(`${contact.name}: ${result.error || 'שגיאה לא ידועה'}`);
  }

  return NextResponse.json({ ok: true, checked: contacts.length, moved, stillValid, errors });
}
