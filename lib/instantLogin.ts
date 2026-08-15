import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// יוצר טוקן כניסה שנפדה מיידית בצד הלקוח (supabase.auth.verifyOtp) - בלי לשלוח מייל בפועל.
// משמש למנויים מאושרים שכבר עברו אימות (אישור ידני או אימות טלפון מול מאנדיי) ולא צריכים לחכות למייל בכל כניסה.
export async function generateInstantLoginToken(email: string) {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (error || !data?.properties?.hashed_token) {
    throw new Error(error?.message || 'לא ניתן היה ליצור טוקן כניסה');
  }

  return data.properties.hashed_token;
}
