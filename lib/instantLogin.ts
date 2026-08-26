import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// שולח מייל כניסה אמיתי (קישור קסם) לכתובת שכבר אושרה כמנוי/אדמין -
// הכניסה בפועל מותנית בלחיצה על הקישור מתוך תיבת המייל, לא רק בידיעת הכתובת.
// הקישור עצמו נוצר דרך Supabase, אבל המייל נשלח דרך Resend (כמו כל שאר המיילים באתר) ולא
// דרך שרת המייל המובנה של Supabase - זה האחרון נוטה להיתקע בהגבלות קצב נמוכות מאוד או
// להיתפס כספאם, מה שגרם למנויים לא לקבל את קישור הכניסה בפועל
export async function sendLoginEmail(email: string) {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: 'https://shirandimor.com/auth/callback' },
  });

  const actionLink = data?.properties?.action_link;
  if (error || !actionLink) {
    throw new Error(error?.message || 'לא ניתן היה ליצור קישור כניסה');
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY לא מוגדר - לא ניתן לשלוח מייל כניסה');
    throw new Error('לא ניתן היה לשלוח מייל כניסה');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: 'כניסה לאתר <noreply@shirandimor.com>',
      to: email,
      subject: 'קישור כניסה לאתר',
      text: `שלום,\n\nהקישור הבא נותן גישה ישירה לחשבון שלך באתר, בלי סיסמה (בתוקף לזמן קצר):\n${actionLink}\n\nאם לא ביקשת קישור כניסה, אפשר פשוט להתעלם מהמייל הזה.`,
      html: `<div dir="rtl" style="font-family:sans-serif;font-size:14px;line-height:1.6;"><p>שלום,</p><p>הקישור הבא נותן גישה ישירה לחשבון שלך באתר, בלי סיסמה (בתוקף לזמן קצר):</p><p><a href="${actionLink}">כניסה לאתר ←</a></p><p>אם לא ביקשת קישור כניסה, אפשר פשוט להתעלם מהמייל הזה.</p></div>`,
    }),
  });

  if (!res.ok) {
    console.error('שגיאה בשליחת מייל כניסה דרך Resend', await res.text().catch(() => ''));
    throw new Error('לא ניתן היה לשלוח מייל כניסה');
  }
}
