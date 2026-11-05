import { supabaseAdmin } from '@/lib/instantLogin';
import { entitlementOrFilter } from '@/lib/entitlement';

function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(/\D/g, '').slice(-9);
}

function normalizeEmail(raw: string | null | undefined): string {
  return (raw || '').trim().toLowerCase();
}

type SubscriberContact = { phones: Set<string>; emails: Set<string> };

// טלפונים ומיילים (מנורמלים) של מנויים פעילים. אין קשר ישיר (foreign key) בין
// trading_plan_responses לבין profiles - הקישור היחיד הוא טלפון/מייל. הטלפון לבדו לא
// מספיק: לרוב המנויים בפועל אין טלפון שמור בפרופיל (רק במייל שהם התחברו איתו) - אז בודקים
// גם מייל, ומי שמתאים באחד מהשניים נחשב מנוי.
export async function getActiveSubscriberContacts(): Promise<SubscriberContact> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('phone, email')
    .eq('role', 'subscriber')
    .eq('subscription_status', 'active');

  return {
    phones: new Set((data || []).map((p) => normalizePhone(p.phone)).filter(Boolean)),
    emails: new Set((data || []).map((p) => normalizeEmail(p.email)).filter(Boolean)),
  };
}

// בודק אם טלפון/מייל שייכים למנוי פעיל
export async function isActiveSubscriber(phone: string | null | undefined, email: string | null | undefined): Promise<boolean> {
  const targetPhone = normalizePhone(phone);
  const targetEmail = normalizeEmail(email);
  if (!targetPhone && !targetEmail) return false;

  const { phones, emails } = await getActiveSubscriberContacts();
  return (!!targetPhone && phones.has(targetPhone)) || (!!targetEmail && emails.has(targetEmail));
}

// כמו getActiveSubscriberContacts, אבל כולל גם אדמין/ות - לא רק role='subscriber'. לשימוש
// במקומות שצריכים לדעת "האם לאדם הזה כבר יש גישה מלאה לאתר בכל צורה שהיא" (כדי לא ליצור לו/ה
// ליד בטעות), לא רק "האם הוא/היא מנוי/ה משלם/ת" - למשל שירן עצמה (שני המיילים שלה) או מישהו/י
// שקיבל/ה גישת מנוי/ה ידנית. entitlementOrFilter זהה ל-hasActiveEntitlement אבל ברמת שאילתה
async function getFullAccessContacts(): Promise<SubscriberContact> {
  const { data } = await supabaseAdmin.from('profiles').select('phone, email').or(entitlementOrFilter());
  return {
    phones: new Set((data || []).map((p) => normalizePhone(p.phone)).filter(Boolean)),
    emails: new Set((data || []).map((p) => normalizeEmail(p.email)).filter(Boolean)),
  };
}

// בודק אם טלפון/מייל שייכים למי שכבר יש לו/ה גישה מלאה לאתר (מנוי/ה פעיל/ה או אדמין) - לא רק
// מנוי/ה. השתמש/י בזה (לא ב-isActiveSubscriber) בכל מקום שמחליט אם ליצור "ליד" חדש למישהו/י,
// כדי שבני משפחה/אדמין לא ייחשבו בטעות לידים חדשים
export async function hasFullAccessContact(phone: string | null | undefined, email: string | null | undefined): Promise<boolean> {
  const targetPhone = normalizePhone(phone);
  const targetEmail = normalizeEmail(email);
  if (!targetPhone && !targetEmail) return false;

  const { phones, emails } = await getFullAccessContacts();
  return (!!targetPhone && phones.has(targetPhone)) || (!!targetEmail && emails.has(targetEmail));
}

// מוצא את תוכנית המסחר (אם הושלמה) ששייכת לטלפון/מייל נתונים - כדי לקשר מהאזור האישי המחובר
// ישירות לעמוד המעקב האישי, בלי לגרום ליצירת תוכנית כפולה למי שכבר מילא
export async function findCompletedTradingPlanIdByContact(phone: string | null | undefined, email: string | null | undefined): Promise<string | null> {
  const targetPhone = normalizePhone(phone);
  const targetEmail = normalizeEmail(email);
  if (!targetPhone && !targetEmail) return null;

  const { data } = await supabaseAdmin
    .from('trading_plan_responses')
    .select('id, phone, email, completed_at')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false });

  const match = (data || []).find(
    (r) => (!!targetPhone && normalizePhone(r.phone) === targetPhone) || (!!targetEmail && normalizeEmail(r.email) === targetEmail)
  );
  return match?.id || null;
}

// מוודא שיש פרופיל מנוי פעיל לאימייל הזה - יוצר חשבון אם אין, או משדרג ל"מנוי" אם היה "ליד" בלבד.
// שומר גם את הטלפון והשם המלא על הפרופיל, כדי שאפשר יהיה בעתיד לבדוק שוב מול מאנדיי אם המנוי עדיין בקבוצה.
// משותף בין אימות מנוי ידני (verify-membership), סנכרון תשלום מ-Grow, וסנכרון מנויים ממאנדיי.
// startedAt אופציונלי - מאפשר להעביר את תאריך ההצטרפות האמיתי (למשל ממאנדיי) במקום "עכשיו",
// כי תאריך ההצטרפות קובע את יום החיוב החודשי וחשוב לדיוק בחישובים כמו צפי הכנסה
// isFirstMonthPrice - true כשהתשלום שהפעיל את הקריאה הזו הוא בדיוק מחיר החודש הראשון (1 ש"ח).
// מסמן trial_price_used=true על הפרופיל לצמיתות (לא מתאפס גם אם המנוי בוטל אח"כ) - כדי
// שאפשר יהיה בעתיד לזהות מי כבר ניצל את המחיר הסמלי ולא להציע לו אותו שוב ב-/subscribe
export async function ensureActiveSubscriberAccount(email: string, phone: string, fullName: string, startedAt?: string, isFirstMonthPrice = false, monthlyPrice?: number | null) {
  const subscriptionStartedAt = startedAt || new Date().toISOString();
  const normalizedPhoneForPlaceholder = normalizePhone(phone);
  // Grow לא תמיד מעביר מייל בתשלום (למשל אם טופס הסליקה אסף רק טלפון) - בלי מייל אין אפשרות
  // ליצור חשבון התחברות אמיתי (Supabase Auth מחייב מייל), אבל אסור שהמנוי ישלם ויישאר בלי גישה
  // בגלל זה: יוצרים placeholder ייחודי לפי הטלפון כדי שהחשבון יהיה פעיל ומלא מהרגע הראשון.
  // כשהוא בעצמו ינסה להתחבר עם המייל האמיתי שלו, ההתאמה לפי טלפון כאן תחליף את הplaceholder
  // במייל האמיתי אוטומטית (ראה הסנכרון בהמשך הפונקציה)
  const effectiveEmail = email || `${normalizedPhoneForPlaceholder}@no-email.shirandimor.com`;

  // טלפון קודם, מייל רק כגיבוי: לכל אדם יש נייד אחד ויחיד, אבל אותו אדם יכול להופיע עם כמה
  // מיילים שונים (למשל שילם פעם עם מייל אחר) - התאמה לפי מייל קודם הייתה מפספסת את זה ויוצרת
  // בטעות חשבון מנוי כפול
  let matched: { id: string; role: string; subscription_status: string | null; email: string | null } | null = null;
  const normalizedNewPhone = normalizePhone(phone);
  if (normalizedNewPhone) {
    const { data: withPhone } = await supabaseAdmin.from('profiles').select('id, role, subscription_status, phone, email').not('phone', 'is', null);
    matched = (withPhone || []).find((p) => normalizePhone(p.phone) === normalizedNewPhone) || null;
  }
  if (!matched && email) {
    const { data: existing } = await supabaseAdmin.from('profiles').select('id, role, subscription_status, email').eq('email', email).maybeSingle();
    matched = existing;
  }

  if (matched) {
    const updates: Record<string, unknown> = { phone, full_name: fullName };
    // "לא מנוי פעיל עדיין" כולל גם מי שהיה מנוי ובוטל (role נשאר subscriber, אבל
    // subscription_status !== 'active') - צריך להפעיל מחדש בדיוק כמו הצטרפות ראשונה
    if (matched.role !== 'admin' && (matched.role !== 'subscriber' || matched.subscription_status !== 'active')) {
      updates.role = 'subscriber';
      updates.subscription_status = 'active';
      updates.subscription_started_at = subscriptionStartedAt;
      updates.subscription_cancelled_at = null;
    }
    if (isFirstMonthPrice) updates.trial_price_used = true;
    // undefined = "לא נמסר כאן" (למשל אימות ידני/Grow שלא יודעים עליו) - לא דורסים מחיר קיים.
    // null/מספר ממאנדיי כן נכתבים, כולל 0 (מנוי בחינם) - ר' הערה דומה ב-lib/revenueSnapshot.ts
    if (monthlyPrice !== undefined) updates.monthly_price = monthlyPrice;

    // התאמה לפי טלפון יכולה למצוא פרופיל עם מייל אחר (למשל פלייסהולדר שנוצר אוטומטית מסנכרון
    // מאנדיי, או מייל ישן) - אם המייל שהתקבל עכשיו שונה, מעדכנים גם אותו, וגם את חשבון
    // ההתחברות (auth.users) כדי שהשניים יישארו מסונכרנים. בלי זה, קוד/קישור כניסה שנשלח
    // בהמשך ל"מייל שונה" הזה היה יוצר בטעות חשבון נפרד חדש (role="lead") ולא מגיע בכלל
    // לפרופיל המנוי הקיים - בדיוק התקלה שגרמה למנוי ששילם לא להצליח להירשם
    if (email && matched.email?.toLowerCase() !== email.toLowerCase()) {
      updates.email = email;
      await supabaseAdmin.auth.admin.updateUserById(matched.id, { email, email_confirm: true }).catch((e) => {
        console.error('שגיאה בעדכון מייל התחברות לפרופיל קיים', matched!.id, e);
      });
    }

    await supabaseAdmin.from('profiles').update(updates).eq('id', matched.id);
    return;
  }

  // role/subscription_status מועברים כבר כאן ב-metadata, כדי שהטריגר שיוצר את הפרופיל (handle_new_user)
  // ייצור אותו ישר כמנוי פעיל - בלי לעבור דרך "ליד" רגעי שמפעיל בטעות את מייל "בקשת הצטרפות לאישור"
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email: effectiveEmail,
    email_confirm: true,
    user_metadata: { phone, full_name: fullName, role: 'subscriber', subscription_status: 'active' },
  });

  let userId = created.user?.id;

  if (error || !userId) {
    // חשבון התחברות כבר קיים באימייל הזה בלי פרופיל (למשל מחיקת מנוי שנעצרה באמצע) - נשלים את הפרופיל
    // החסר על אותו חשבון קיים במקום להיכשל
    if (error?.code === 'email_exists' || /already.*registered/i.test(error?.message || '')) {
      const { data: existingUserId } = await supabaseAdmin.rpc('find_auth_user_id_by_email', { p_email: effectiveEmail });
      if (!existingUserId) throw new Error(error?.message || 'שגיאה ביצירת חשבון');
      userId = existingUserId;
    } else {
      throw new Error(error?.message || 'שגיאה ביצירת חשבון');
    }
  }

  await supabaseAdmin
    .from('profiles')
    .upsert({
      id: userId, email: effectiveEmail, full_name: fullName, role: 'subscriber', subscription_status: 'active',
      subscription_started_at: subscriptionStartedAt, phone, trial_price_used: isFirstMonthPrice,
      monthly_price: monthlyPrice ?? null,
    });
}

export { normalizePhone, normalizeEmail };
