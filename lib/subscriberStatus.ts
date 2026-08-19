import { supabaseAdmin } from '@/lib/instantLogin';

function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(/\D/g, '').slice(-9);
}

// בודק אם מספר טלפון שייך למנוי פעיל. אין קשר ישיר (foreign key) בין trading_plan_responses
// לבין profiles - הקישור היחיד שיש בין שני העולמות הוא מספר הטלפון, אז זו ההשוואה שאפשר לעשות.
export async function isActiveSubscriberPhone(phone: string | null | undefined): Promise<boolean> {
  const target = normalizePhone(phone);
  if (!target) return false;

  const { data } = await supabaseAdmin
    .from('profiles')
    .select('phone')
    .eq('role', 'subscriber')
    .eq('subscription_status', 'active');

  return (data || []).some((p) => normalizePhone(p.phone) === target);
}
