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
      emailRedirectTo: 'https://shirandimor.com/auth/callback',
    },
  });

  if (error) {
    // אם מדובר רק בהגבלת קצב של Supabase (ניסיון חוזר תוך פחות מדקה) - כבר נשלח קישור תקף לפני רגע,
    // אז זו לא כשל אמיתי; לא זורקים שגיאה כדי שהמשתמש לא ייראה "לא מזוהה" בגלל ניסיון חוזר מהיר מדי
    const isRateLimit = (error as { status?: number; code?: string }).status === 429
      || (error as { code?: string }).code === 'over_email_send_rate_limit'
      || /security purposes/i.test(error.message || '');

    if (!isRateLimit) {
      throw new Error(error.message || 'לא ניתן היה לשלוח מייל כניסה');
    }
  }
}
