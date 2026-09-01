import { supabaseAdmin } from '@/lib/instantLogin';

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
export async function ensureActiveSubscriberAccount(email: string, phone: string, fullName: string, startedAt?: string) {
  const subscriptionStartedAt = startedAt || new Date().toISOString();

  // טלפון קודם, מייל רק כגיבוי: לכל אדם יש נייד אחד ויחיד, אבל אותו אדם יכול להופיע עם כמה
  // מיילים שונים (למשל שילם פעם עם מייל אחר) - התאמה לפי מייל קודם הייתה מפספסת את זה ויוצרת
  // בטעות חשבון מנוי כפול
  let matched: { id: string; role: string } | null = null;
  const normalizedNewPhone = normalizePhone(phone);
  if (normalizedNewPhone) {
    const { data: withPhone } = await supabaseAdmin.from('profiles').select('id, role, phone').not('phone', 'is', null);
    matched = (withPhone || []).find((p) => normalizePhone(p.phone) === normalizedNewPhone) || null;
  }
  if (!matched) {
    const { data: existing } = await supabaseAdmin.from('profiles').select('id, role').eq('email', email).maybeSingle();
    matched = existing;
  }

  if (matched) {
    const updates: Record<string, unknown> = { phone, full_name: fullName };
    if (matched.role !== 'admin' && matched.role !== 'subscriber') {
      updates.role = 'subscriber';
      updates.subscription_status = 'active';
      updates.subscription_started_at = subscriptionStartedAt;
    }
    await supabaseAdmin.from('profiles').update(updates).eq('id', matched.id);
    return;
  }

  // role/subscription_status מועברים כבר כאן ב-metadata, כדי שהטריגר שיוצר את הפרופיל (handle_new_user)
  // ייצור אותו ישר כמנוי פעיל - בלי לעבור דרך "ליד" רגעי שמפעיל בטעות את מייל "בקשת הצטרפות לאישור"
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { phone, full_name: fullName, role: 'subscriber', subscription_status: 'active' },
  });

  let userId = created.user?.id;

  if (error || !userId) {
    // חשבון התחברות כבר קיים באימייל הזה בלי פרופיל (למשל מחיקת מנוי שנעצרה באמצע) - נשלים את הפרופיל
    // החסר על אותו חשבון קיים במקום להיכשל
    if (error?.code === 'email_exists' || /already.*registered/i.test(error?.message || '')) {
      const { data: existingUserId } = await supabaseAdmin.rpc('find_auth_user_id_by_email', { p_email: email });
      if (!existingUserId) throw new Error(error?.message || 'שגיאה ביצירת חשבון');
      userId = existingUserId;
    } else {
      throw new Error(error?.message || 'שגיאה ביצירת חשבון');
    }
  }

  await supabaseAdmin
    .from('profiles')
    .upsert({ id: userId, email, full_name: fullName, role: 'subscriber', subscription_status: 'active', subscription_started_at: subscriptionStartedAt, phone });
}

export { normalizePhone, normalizeEmail };
