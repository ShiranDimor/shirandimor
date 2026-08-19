import { supabaseAdmin } from '@/lib/instantLogin';

function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(/\D/g, '').slice(-9);
}

// מוצא את תוכנית המסחר (אם הושלמה) ששייכת למספר טלפון נתון - כדי לקשר מהאזור האישי המחובר
// ישירות לעמוד המעקב שלו/ה, בלי לגרום ליצירת תוכנית כפולה למי שכבר מילא/ה
export async function findCompletedTradingPlanIdByPhone(phone: string | null | undefined): Promise<string | null> {
  const target = normalizePhone(phone);
  if (!target) return null;

  const { data } = await supabaseAdmin
    .from('trading_plan_responses')
    .select('id, phone, completed_at')
    .eq('status', 'completed')
    .not('phone', 'is', null)
    .order('completed_at', { ascending: false });

  const match = (data || []).find((r) => normalizePhone(r.phone) === target);
  return match?.id || null;
}

// כל מספרי הטלפון (מנורמלים) של מנויים פעילים - שימושי כשצריך לסנן רשימה שלמה בלי לשלוח שאילתה לכל שורה
export async function getActiveSubscriberPhoneSet(): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('phone')
    .eq('role', 'subscriber')
    .eq('subscription_status', 'active');

  return new Set((data || []).map((p) => normalizePhone(p.phone)).filter(Boolean));
}

// בודק אם מספר טלפון שייך למנוי פעיל. אין קשר ישיר (foreign key) בין trading_plan_responses
// לבין profiles - הקישור היחיד שיש בין שני העולמות הוא מספר הטלפון, אז זו ההשוואה שאפשר לעשות.
export async function isActiveSubscriberPhone(phone: string | null | undefined): Promise<boolean> {
  const target = normalizePhone(phone);
  if (!target) return false;

  const phones = await getActiveSubscriberPhoneSet();
  return phones.has(target);
}

export { normalizePhone };
