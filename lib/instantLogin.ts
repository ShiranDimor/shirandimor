import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// שולח מייל כניסה אמיתי (קישור קסם) לכתובת שכבר אושרה כמנוי/אדמין -
// הכניסה בפועל מותנית בלחיצה על הקישור מתוך תיבת המייל, לא רק בידיעת הכתובת
export async function sendLoginEmail(email: string) {
  const { error } = await supabaseAdmin.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: 'https://www.shirandimor.com/login/callback',
    },
  });

  if (error) {
    throw new Error(error.message || 'לא ניתן היה לשלוח מייל כניסה');
  }
}
