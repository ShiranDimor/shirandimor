import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function generateSixDigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// שולח מייל כניסה אמיתי (קוד חד-פעמי שאנחנו מנפיקים בעצמנו + קישור גיבוי) לכתובת שכבר
// אושרה כמנוי/אדמין - הכניסה בפועל מותנית בהקלדת הקוד (או לחיצה על הקישור), לא רק בידיעת
// הכתובת. המייל עצמו נשלח דרך Resend (כמו כל שאר המיילים באתר) ולא דרך שרת המייל המובנה
// של Supabase - זה האחרון נוטה להיתקע בהגבלות קצב נמוכות מאוד או להיתפס כספאם, מה שגרם
// למנויים לא לקבל את מייל הכניסה בפועל.
//
// הקוד לא מגיע מ-Supabase (data.properties.email_otp היה אמור להכיל אותו, אבל בפועל לא
// תמיד מאוכלס - בדיקה אמיתית מול משתמש אמיתי הראתה שהמייל חוזר בלי קוד בכלל) - אנחנו
// מנפיקים קוד 6-ספרות בעצמנו, שומרים אותו בטבלת login_codes יחד עם ה-token_hash שחולץ
// מתוך ה-action_link שכן עובד באופן מאומת (הוא הקישור שכבר נשלח ועבד), ומאמתים אותו
// בשרת (ר' app/api/verify-login-code) מול אותו token_hash - לא תלויים באף התנהגות לא-
// מתועדת של Supabase. הקישור נשאר גם כגיבוי מלא, בדיוק כמו שהיה
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

  // פרמטר ה-token מתוך ה-action_link הוא בדיוק ה-token_hash שצריך בשביל
  // supabase.auth.verifyOtp({ token_hash, type: 'email' }) - מתועד כך בדוגמת ה-email
  // templates הרשמית של Supabase (הקישור הוא .../verify?token={{.TokenHash}}&type=...)
  let tokenHash: string | null = null;
  try {
    tokenHash = new URL(actionLink).searchParams.get('token');
  } catch (e) {
    tokenHash = null;
  }

  let otpIncluded = false;
  let code: string | null = null;

  if (tokenHash) {
    code = generateSixDigitCode();
    const { error: insertError } = await supabaseAdmin.from('login_codes').insert({
      email: email.trim().toLowerCase(),
      code,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    otpIncluded = !insertError;
    if (insertError) console.error('שגיאה בשמירת קוד כניסה', insertError);
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY לא מוגדר - לא ניתן לשלוח מייל כניסה');
    throw new Error('לא ניתן היה לשלוח מייל כניסה');
  }

  const siteUrl = 'https://www.shirandimor.com';
  const codeBlock = otpIncluded
    ? `<div style="text-align:center;background:#17151A;border:1px solid #332E35;border-radius:12px;padding:18px;margin-bottom:16px;">
         <div style="font-size:11.5px;color:#9A939B;margin-bottom:8px;">קוד הכניסה שלך</div>
         <div style="font-family:monospace;font-size:32px;font-weight:700;color:#FFB648;letter-spacing:6px;">${code}</div>
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
          <p style="font-size:12.5px;color:#9A939B;line-height:1.6;margin:0;">${otpIncluded ? 'לא ביקשת קוד כניסה?' : 'לא ביקשת קישור כניסה?'} כדאי לספר לי - פשוט משיבים למייל הזה.</p>
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
      subject: otpIncluded ? `${code} הוא קוד הכניסה שלך` : 'קישור כניסה לאתר שלך',
      text: otpIncluded
        ? `היי, קוד הכניסה שלך: ${code} (בתוקף לשעה).\nאפשר גם ללחוץ על הקישור: ${actionLink}\n\nלא ביקשת קוד כניסה? כדאי לספר לי - פשוט משיבים למייל הזה.`
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
