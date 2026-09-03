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

  // חריגים קבועים - אנשים עם חשבון מנוי אמיתי שהוענק ידנית מחוץ למאנדיי לגמרי (למשל בני משפחה),
  // ולכן תמיד "לא ימצאו" שם בבדיקה - זה לא באג, זה מצב קבוע ומכוון. בלי הרשימה הזו הם תמיד
  // יסומנו כמועמדים להסרה, ויתפסו אותנו לחשוב שיש בעיה אמיתית בכל פעם
  // כולל גם מי שקיבל/ה מנוי ידני דרך "הוספת מנוי/ה ידנית" (לא דרך מאנדיי) - למשל קבוצת ניסיון
  // של 7 ימים - כדי שהם לא ייראו כמועמדים להסרה רק כי הם לא בקבוצת הסוחרים במאנדיי בכלל
  const MANUAL_EXEMPT_EMAILS = new Set(['sivandimor@gmail.com', 'gil_dicastro@icloud.com']);

  const nonExempted = (subscribers || []).filter((s) => !MANUAL_EXEMPT_EMAILS.has(normalizeEmail(s.email)));
  const withContact = nonExempted.filter((s) => s.phone || s.email);
  const skippedNoPhone = nonExempted.length - withContact.length;

  const { phones: activePhones, emails: activeEmails } = await getMondaySubscriberContacts();

  if (activePhones.size === 0 && activeEmails.size === 0) {
    return NextResponse.json({ error: 'לא נמצאו נתונים בקבוצת "קבוצת סוחרים" במאנדיי' }, { status: 500 });
  }

  const toRemove = withContact.filter(
    (s) =>
      !(s.phone && activePhones.has(normalizePhone(s.phone))) &&
      !(s.email && activeEmails.has(normalizeEmail(s.email)))
  );

  // רשת ביטחון: הסרה של חלק גדול ופתאומי מהמנויים כמעט תמיד אומרת שהשליפה ממאנדיי הייתה
  // חלקית/נכשלה (למשל rate limit באמצע pagination) ולא שבאמת כולם עזבו בבת אחת - בדיוק מה
  // שקרה בפועל ב-1.9.2026 (48 ירדו ל-31). לא מבצעים הסרה אוטומטית במקרה חריג כזה - רק מדווחים.
  // activePhones/activeEmails.size מוחזרים גם כדי שיהיה אפשר לראות אם השליפה ממאנדיי עצמה
  // חשודה בגודלה (למשל הרבה יותר קטנה מהמצופה) - זה יעזור לאבחן אם התקלה חוזרת שוב
  const REMOVAL_SAFETY_LIMIT = Math.max(5, Math.ceil(withContact.length * 0.15));
  if (toRemove.length > REMOVAL_SAFETY_LIMIT) {
    return NextResponse.json({
      error: `בטיחות: השליפה ממאנדיי הציעה להסיר ${toRemove.length} מתוך ${withContact.length} מנויים בבת אחת - זה חריג מדי ונראה כמו תקלה בשליפה, לא ירידה אמיתית. שום מנוי לא הוסר. בדקי ידנית מול מאנדיי לפני שמריצים שוב.`,
      proposedRemovals: toRemove.map((s) => s.full_name || s.email),
      mondayPhonesCount: activePhones.size,
      mondayEmailsCount: activeEmails.size,
    }, { status: 500 });
  }

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

  // מייל הוא לא הזיהוי החשוב - נייד הוא (יש רק אחד לכל אדם) - אבל מייל כן נחוץ טכנית כדי
  // ליצור חשבון התחברות אמיתי (ההתחברות באתר כולה מבוססת על קישור למייל, אין דרך אחרת).
  // מי שיש לו/ה נייד בלי מייל בכלל במאנדיי עדיין מקבל/ת חשבון "מנוי" באתר (כדי שהספירה תהיה
  // מדויקת) עם מייל-placeholder פנימי שלא הולך לאף אחד - רק כדי שהמערכת תוכל ליצור את החשבון.
  // אם ירצו להתחבר בפועל, יצטרכו למסור מייל אמיתי (למשל בעמוד ההתחברות), ואז ההתאמה לפי נייד
  // תזהה את אותו חשבון קיים במקום ליצור כפילות.
  const PLACEHOLDER_EMAIL_DOMAIN = 'no-email.shirandimor.internal';

  const mondaySubscribers = await getMondaySubscriberDetails();
  const createdNames: string[] = [];
  const placeholderEmailNames: string[] = [];
  const skippedNoContact: string[] = [];

  for (const s of mondaySubscribers) {
    const normPhone = s.phone ? normalizePhone(s.phone) : '';
    const normEmail = s.email ? normalizeEmail(s.email) : '';
    const alreadySubscriber = (normPhone && existingSubscriberPhones.has(normPhone)) || (normEmail && existingSubscriberEmails.has(normEmail));
    if (alreadySubscriber) continue;

    if (!s.email && !normPhone) {
      skippedNoContact.push(s.name || 'ללא שם');
      continue;
    }

    const usingPlaceholder = !s.email;
    const emailToUse = s.email || `p${normPhone}@${PLACEHOLDER_EMAIL_DOMAIN}`;

    try {
      await ensureActiveSubscriberAccount(emailToUse, s.phone || '', s.name || 'מנוי חדש', s.joinDate || undefined);
      createdNames.push(s.name || s.email || s.phone || '');
      if (usingPlaceholder) placeholderEmailNames.push(s.name || s.phone || '');
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
    placeholderEmailNames,
    skippedNoContact,
    mondayPhonesCount: activePhones.size,
    mondayEmailsCount: activeEmails.size,
    mondayTotalContacts: mondaySubscribers.length,
  });
}
