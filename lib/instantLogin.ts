import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// שולח מייל כניסה אמיתי (קוד חד-פעמי + קישור גיבוי) לכתובת שכבר אושרה כמנוי/אדמין -
// הכניסה בפועל מותנית בהקלדת הקוד (או לחיצה על הקישור), לא רק בידיעת הכתובת.
// הקוד/קישור נוצרים דרך Supabase (generateLink), אבל המייל עצמו נשלח דרך Resend (כמו כל
// שאר המיילים באתר) ולא דרך שרת המייל המובנה של Supabase - זה האחרון נוטה להיתקע בהגבלות
// קצב נמוכות מאוד או להיתפס כספאם, מה שגרם למנויים לא לקבל את מייל הכניסה בפועל.
// הקישור נשאר גם כגיבוי - אם משום מה Supabase לא מחזיר קוד תקין (email_otp), עדיין אפשר
// להיכנס דרך הקישור בדיוק כמו קודם, בלי שום נסיגה. מחזיר האם קוד נכלל בפועל במייל, כדי
// שהעמוד יידע אם להציג שדה הקלדת קוד או רק "שלחנו לך קישור"
// ה-redirectTo נשאר קבוע בכוונה ולא מצרף returnTo דינמי - זה חייב להיות בדיוק אחד
// מה-URL-ים המורשים בהגדרות ה-Auth של Supabase, ובלי לבדוק שם את הקונפיגורציה בפועל
// (לא זמין מהסשן הזה כרגע) עדיף לא לקחת סיכון שישבור את קישור הגיבוי כולו. הנתיב הספציפי
// לחזרה אליו מטופל בנתיב הראשי (קוד מוקלד באתר עצמו) דרך login/page.tsx, לא דרך המייל
export async function sendLoginEmail(email: string): Promise<{ otpIncluded: boolean }> {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: 'https://www.shirandimor.com/auth/callback' },
  });

  const actionLink = data?.properties?.action_link;
  if (error || !actionLink) {
    throw new Error(error?.message || 'לא ניתן היה ליצור קישור כניסה');
  }

  // שדה לא-רשמי בטיפוסים הישנים של supabase-js, אבל קיים בפועל בתשובת ה-API - גישה דרך
  // Record כדי לא להישבר אם הטיפוס הרשמי לא כולל אותו
  const otpCode = (data.properties as unknown as Record<string, unknown>)?.email_otp;
  const otpIncluded = typeof otpCode === 'string' && /^\d{6}$/.test(otpCode);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY לא מוגדר - לא ניתן לשלוח מייל כניסה');
    throw new Error('לא ניתן היה לשלוח מייל כניסה');
  }

  const siteUrl = 'https://www.shirandimor.com';
  const codeBlock = otpIncluded
    ? `<div style="text-align:center;background:#17151A;border:1px solid #332E35;border-radius:12px;padding:18px;margin-bottom:16px;">
         <div style="font-size:11.5px;color:#9A939B;margin-bottom:8px;">קוד הכניסה שלך</div>
         <div style="font-family:monospace;font-size:32px;font-weight:700;color:#FFB648;letter-spacing:6px;">${otpCode}</div>
       </div>
       <p style="font-size:12.5px;color:#9A939B;line-height:1.6;margin:0 0 16px;">מקלידים את הקוד באתר עצמו, בלי לצאת מהאפליקציה. בתוקף לשעה. אפשר גם ללחוץ על הקישור למטה:</p>`
    : `<p style="font-size:14px;color:#F2EFF1;line-height:1.7;margin:0 0 16px;">היי, זה קישור כניסה לחשבון שלך באתר - בלי סיסמה, בתוקף לשעה:</p>`;

  const html = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8" /></head><body style="margin:0;padding:0;">
    <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#121013; padding:24px 12px;">
      <div style="max-width:520px;margin:0 auto;background:#211F23;border-radius:14px;overflow:hidden;border:1px solid #332E35;">
        <div style="background:#17151A;padding:24px;text-align:center;">
          <img src="${siteUrl}/shiran-photo.jpg" width="56" height="56" alt="שירן דימור" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #FF2D78;margin-bottom:12px;" />
          <div style="color:#fff;font-size:18px;font-weight:700;">מסחר <span style="color:#FF2D78;">אחראי</span> במניות</div>
          <div style="color:#FFD18A;font-size:12px;margin-top:8px;">שירן דימור</div>
        </div>
        <div style="padding:28px 24px;">
          ${codeBlock}
          <a href="${actionLink}" style="display:block;text-align:center;background:linear-gradient(90deg,#FF2D78,#FFB648);color:#1A181C;text-decoration:none;font-weight:700;padding:13px;border-radius:10px;margin-bottom:20px;">כניסה לאתר ←</a>
          <p style="font-size:12.5px;color:#9A939B;line-height:1.6;margin:0;">לא ביקשת קוד כניסה? כדאי לספר לי - פשוט משיבים למייל הזה.</p>
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
      subject: otpIncluded ? `${otpCode} הוא קוד הכניסה שלך` : 'קישור כניסה לאתר שלך',
      text: otpIncluded
        ? `היי, קוד הכניסה שלך: ${otpCode} (בתוקף לשעה).\nאפשר גם ללחוץ על הקישור: ${actionLink}\n\nלא ביקשת קוד כניסה? כדאי לספר לי - פשוט משיבים למייל הזה.`
        : `היי, זה קישור כניסה לחשבון שלך באתר - בלי סיסמה, בתוקף לשעה:\n${actionLink}\n\nלא ביקשת קישור כניסה? כדאי לספר לי - פשוט משיבים למייל הזה.`,
      html,
    }),
  });

  if (!res.ok) {
    console.error('שגיאה בשליחת מייל כניסה דרך Resend', await res.text().catch(() => ''));
    throw new Error('לא ניתן היה לשלוח מייל כניסה');
  }

  return { otpIncluded };
}
