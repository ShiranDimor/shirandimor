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

  const siteUrl = 'https://www.shirandimor.com';
  const html = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8" /></head><body style="margin:0;padding:0;">
    <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
      <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">
        <div style="background:#111318;padding:24px;text-align:center;">
          <img src="${siteUrl}/shiran-photo.jpg" width="56" height="56" alt="שירן דימור" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #4fc9c4;margin-bottom:12px;" />
          <div style="color:#fff;font-size:18px;font-weight:700;">מסחר <span style="color:#4fc9c4;">אחראי</span> במניות</div>
          <div style="color:#9C8FD9;font-size:12px;margin-top:8px;">שירן דימור</div>
        </div>
        <div style="padding:28px 24px;">
          <p style="font-size:14px;color:#222;line-height:1.7;margin:0 0 16px;">היי, זה קישור כניסה לחשבון שלך באתר - בלי סיסמה, בתוקף לזמן קצר:</p>
          <a href="${actionLink}" style="display:block;text-align:center;background:#4fc9c4;color:#08131a;text-decoration:none;font-weight:700;padding:13px;border-radius:10px;margin-bottom:20px;">כניסה לאתר ←</a>
          <p style="font-size:12.5px;color:#888;line-height:1.6;margin:0;">אם לא ביקשת את זה, אפשר פשוט להתעלם מהמייל. יש שאלה? אפשר לענות ישירות למייל הזה.</p>
        </div>
      </div>
    </div>
  </body></html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: 'שירן דימור - מסחר אחראי במניות <noreply@shirandimor.com>',
      to: email,
      reply_to: 'shiran@shirandimor.com',
      subject: 'קישור כניסה לאתר שלך',
      text: `היי, זה קישור כניסה לחשבון שלך באתר - בלי סיסמה, בתוקף לזמן קצר:\n${actionLink}\n\nאם לא ביקשת את זה, אפשר פשוט להתעלם מהמייל.`,
      html,
    }),
  });

  if (!res.ok) {
    console.error('שגיאה בשליחת מייל כניסה דרך Resend', await res.text().catch(() => ''));
    throw new Error('לא ניתן היה לשלוח מייל כניסה');
  }
}
