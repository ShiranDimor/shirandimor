import { supabaseAdmin } from '@/lib/instantLogin';
import { getMondaySubscriberDetails, getMondaySubscriberContacts } from '@/lib/tradingPlan/monday';
import { ensureActiveSubscriberAccount, normalizePhone, normalizeEmail } from '@/lib/subscriberStatus';

export type MondaySubscriberSyncResult = {
  totalInMonday: number;
  created: number;
  updated: number;
  alreadyOk: number;
  skippedNoEmail: string[];
  failed: { name: string | null; error: string }[];
};

// גרסה חד-כיוונית (רק תוספות) - לא בשימוש יותר ישירות (ראו syncSubscribersBidirectional), נשארת
// מיוצאת כי ensureActiveSubscriberAccount ושאר ההיגיון שלה עדיין רלוונטיים למקומות אחרים
export async function syncMondaySubscribersToSite(): Promise<MondaySubscriberSyncResult> {
  const subscribers = await getMondaySubscriberDetails();

  let created = 0;
  let updated = 0;
  let alreadyOk = 0;
  const skippedNoEmail: string[] = [];
  const failed: { name: string | null; error: string }[] = [];

  for (const sub of subscribers) {
    const email = sub.email?.trim().toLowerCase();
    if (!email) {
      skippedNoEmail.push(sub.name || 'ללא שם');
      continue;
    }

    try {
      const { data: existing } = await supabaseAdmin.from('profiles').select('id, role').eq('email', email).maybeSingle();
      const startedAt = sub.joinDate ? new Date(sub.joinDate).toISOString() : undefined;

      await ensureActiveSubscriberAccount(email, sub.phone || '', sub.name || email, startedAt);

      if (!existing) created += 1;
      else if (existing.role !== 'admin' && existing.role !== 'subscriber') updated += 1;
      else alreadyOk += 1;
    } catch (e) {
      failed.push({ name: sub.name, error: e instanceof Error ? e.message : 'שגיאה לא ידועה' });
    }
  }

  return { totalInMonday: subscribers.length, created, updated, alreadyOk, skippedNoEmail, failed };
}

export type BidirectionalSyncResult = {
  checked: number;
  removed: number;
  removedNames: string[];
  skippedNoPhone: number;
  created: number;
  createdNames: string[];
  placeholderEmailNames: string[];
  skippedNoContact: string[];
  mondayPhonesCount: number;
  mondayEmailsCount: number;
  mondayTotalContacts: number;
} | { error: string; proposedRemovals?: string[]; mondayPhonesCount?: number; mondayEmailsCount?: number };

// חריגים קבועים - אנשים עם חשבון מנוי אמיתי שהוענק ידנית מחוץ למאנדיי לגמרי (למשל בני משפחה),
// ולכן תמיד "לא ימצאו" שם בבדיקה - זה לא באג, זה מצב קבוע ומכוון
const MANUAL_EXEMPT_EMAILS = new Set(['sivandimor@gmail.com', 'gil_dicastro@icloud.com']);
const PLACEHOLDER_EMAIL_DOMAIN = 'no-email.shirandimor.internal';

// סנכרון דו-כיווני מלא מול "קבוצת סוחרים" במאנדיי - המקור היחיד שמשותף בין ההרצה היומית
// האוטומטית (cron) לבין כפתור "סנכרון מלא" הידני בפאנל הניהול, כדי ששני המקומות יתנהגו זהה:
// (1) מי שכבר לא בקבוצה במאנדיי מאבד/ת גישה פעילה וחוזר/ת להיות ליד רגיל (role="lead",
//     subscription_status=cancelled לתיעוד) - לא נשאר/ת ברשימת מנויים, כי שירן ביקשה מפורשות
//     שברשימת מנויים יופיעו רק מי שבאמת משלם. (2) מי שבקבוצה במאנדיי אבל עוד אין לו/ה חשבון
//     מנוי/ה פעיל/ה באתר - מקבל/ת אחד עכשיו, כולל הפעלה מחדש אוטומטית למי שבוטל/ה בעבר וחזר/ה
export async function syncSubscribersBidirectional(): Promise<BidirectionalSyncResult> {
  const { data: subscribers, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, phone, role, subscription_status')
    .eq('role', 'subscriber');

  if (error) return { error: error.message };

  const nonExempted = (subscribers || []).filter((s) => !MANUAL_EXEMPT_EMAILS.has(normalizeEmail(s.email)));
  const withContact = nonExempted.filter((s) => s.phone || s.email);
  const skippedNoPhone = nonExempted.length - withContact.length;

  const { phones: activePhones, emails: activeEmails } = await getMondaySubscriberContacts();

  if (activePhones.size === 0 && activeEmails.size === 0) {
    return { error: 'לא נמצאו נתונים בקבוצת "קבוצת סוחרים" במאנדיי' };
  }

  const toRemove = withContact.filter(
    (s) =>
      !(s.phone && activePhones.has(normalizePhone(s.phone))) &&
      !(s.email && activeEmails.has(normalizeEmail(s.email)))
  );

  // רשת ביטחון: הסרה של חלק גדול ופתאומי מהמנויים כמעט תמיד אומרת שהשליפה ממאנדיי הייתה
  // חלקית/נכשלה (למשל rate limit באמצע pagination) ולא שבאמת כולם עזבו בבת אחת
  const REMOVAL_SAFETY_LIMIT = Math.max(5, Math.ceil(withContact.length * 0.15));
  if (toRemove.length > REMOVAL_SAFETY_LIMIT) {
    return {
      error: `בטיחות: השליפה ממאנדיי הציעה להסיר ${toRemove.length} מתוך ${withContact.length} מנויים בבת אחת - זה חריג מדי ונראה כמו תקלה בשליפה, לא ירידה אמיתית. שום מנוי לא הוסר. בדקי ידנית מול מאנדיי לפני שמריצים שוב.`,
      proposedRemovals: toRemove.map((s) => s.full_name || s.email),
      mondayPhonesCount: activePhones.size,
      mondayEmailsCount: activeEmails.size,
    };
  }

  if (toRemove.length > 0) {
    await supabaseAdmin
      .from('profiles')
      .update({ role: 'lead', subscription_status: 'cancelled', subscription_cancelled_at: new Date().toISOString() })
      .in('id', toRemove.map((s) => s.id));
  }

  // כיוון הפוך: מי שכן בקבוצת הסוחרים במאנדיי אבל אין לו/ה עדיין חשבון מנוי/ה פעיל/ה באתר -
  // מקבל/ת אחד עכשיו (כולל הפעלה מחדש למי שהיה/הייתה מנוי/ה ובוטל/ה)
  const { data: activeSubscriberProfiles } = await supabaseAdmin
    .from('profiles')
    .select('phone, email')
    .eq('role', 'subscriber')
    .eq('subscription_status', 'active');
  const existingActivePhones = new Set((activeSubscriberProfiles || []).map((p) => normalizePhone(p.phone || '')).filter(Boolean));
  const existingActiveEmails = new Set((activeSubscriberProfiles || []).map((p) => normalizeEmail(p.email || '')).filter(Boolean));

  const mondaySubscribers = await getMondaySubscriberDetails();
  const createdNames: string[] = [];
  const placeholderEmailNames: string[] = [];
  const skippedNoContact: string[] = [];

  for (const s of mondaySubscribers) {
    const normPhone = s.phone ? normalizePhone(s.phone) : '';
    const normEmail = s.email ? normalizeEmail(s.email) : '';
    const alreadyActive = (normPhone && existingActivePhones.has(normPhone)) || (normEmail && existingActiveEmails.has(normEmail));
    if (alreadyActive) continue;

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
      if (normPhone) existingActivePhones.add(normPhone);
      if (normEmail) existingActiveEmails.add(normEmail);
    } catch (e) {
      console.error('שגיאה ביצירת/שדרוג פרופיל מנוי מתוך מאנדיי', s, e);
    }
  }

  return {
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
  };
}
