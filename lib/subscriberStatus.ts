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

export { normalizePhone, normalizeEmail };
