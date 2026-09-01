import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { getMondaySubscriberContacts, getMondaySubscriberDetails } from '@/lib/tradingPlan/monday';
import { normalizePhone, normalizeEmail, ensureActiveSubscriberAccount } from '@/lib/subscriberStatus';

// דו-כיווני: (1) עובר על כל המנויים המאושרים באתר, ובודק שהם עדיין נמצאים בקבוצת "קבוצת סוחרים"
// במאנדיי - לפי טלפון או מייל (לרוב המנויים בפועל אין טלפון שמור, רק מייל) - מי שכבר לא שם
// מורד מ"מנוי" ל"ליד", ומאבד את הכניסה המיידית. (2) הכיוון ההפוך - מי שנמצא/ת בקבוצת הסוחרים
// במאנדיי אבל עדיין אין לו/ה פרופיל מנוי/ה באתר (למשל כי מעולם לא נכנס/ה בעצמו/ה כדי "להירשם")
// מקבל/ת חשבון מנוי/ה עכשיו - כדי שהספירה באתר תמיד תשקף במדויק את מה שבאמת קיים במאנדיי
export async function POST(request: Request) {
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

  const mondayToken = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;

  if (!mondayToken || !boardId) {
    return NextResponse.json({ error: 'Monday.com לא מוגדר' }, { status: 500 });
  }

  const { data: subscribers, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, phone')
    .eq('role', 'subscriber');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const withContact = (subscribers || []).filter((s) => s.phone || s.email);
  const skippedNoPhone = (subscribers || []).length - withContact.length;

  const { phones: activePhones, emails: activeEmails } = await getMondaySubscriberContacts();

  if (activePhones.size === 0 && activeEmails.size === 0) {
    return NextResponse.json({ error: 'לא נמצאו נתונים בקבוצת "קבוצת סוחרים" במאנדיי' }, { status: 500 });
  }

  const toRemove = withContact.filter(
    (s) =>
      !(s.phone && activePhones.has(normalizePhone(s.phone))) &&
      !(s.email && activeEmails.has(normalizeEmail(s.email)))
  );

  if (toRemove.length > 0) {
    await supabaseAdmin
      .from('profiles')
      .update({ role: 'lead' })
      .in('id', toRemove.map((s) => s.id));
  }

  // כיוון הפוך: מי שכן בקבוצת הסוחרים במאנדיי אבל אין לו/ה עדיין פרופיל "מנוי" באתר - מקבל/ת
  // אחד עכשיו. חשוב: מדלגים רק על מי שכבר subscriber/admin בפועל - מי שיש לו/ה פרופיל אחר
  // (למשל "ליד" ממילוי שאלון בעבר) חייב/ת עדיין לעבור דרך ensureActiveSubscriberAccount, כי
  // היא זו שמשדרגת "ליד" קיים ל"מנוי" - סינון מוקדם לפי "יש כבר איזשהו פרופיל" היה מדלג
  // בטעות גם על המקרה הזה ומשאיר את המנוי בלי שדרוג
  const { data: subscriberProfiles } = await supabaseAdmin.from('profiles').select('phone, email').in('role', ['subscriber', 'admin']);
  const existingSubscriberPhones = new Set((subscriberProfiles || []).map((p) => normalizePhone(p.phone || '')).filter(Boolean));
  const existingSubscriberEmails = new Set((subscriberProfiles || []).map((p) => normalizeEmail(p.email || '')).filter(Boolean));

  const mondaySubscribers = await getMondaySubscriberDetails();
  const createdNames: string[] = [];
  const skippedNoEmail: string[] = [];

  for (const s of mondaySubscribers) {
    const normPhone = s.phone ? normalizePhone(s.phone) : '';
    const normEmail = s.email ? normalizeEmail(s.email) : '';
    const alreadySubscriber = (normPhone && existingSubscriberPhones.has(normPhone)) || (normEmail && existingSubscriberEmails.has(normEmail));
    if (alreadySubscriber) continue;

    if (!s.email) {
      skippedNoEmail.push(s.name || s.phone || 'ללא שם');
      continue;
    }

    try {
      await ensureActiveSubscriberAccount(s.email, s.phone || '', s.name || 'מנוי חדש', s.joinDate || undefined);
      createdNames.push(s.name || s.email);
      if (normPhone) existingSubscriberPhones.add(normPhone);
      if (normEmail) existingSubscriberEmails.add(normEmail);
    } catch (e) {
      console.error('שגיאה ביצירת/שדרוג פרופיל מנוי מתוך מאנדיי', s, e);
    }
  }

  return NextResponse.json({
    checked: withContact.length,
    removed: toRemove.length,
    removedNames: toRemove.map((s) => s.full_name || s.email),
    skippedNoPhone,
    created: createdNames.length,
    createdNames,
    skippedNoEmail,
  });
}
