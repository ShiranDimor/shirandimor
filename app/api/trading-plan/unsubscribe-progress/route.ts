import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { buildProgressUnsubscribeAdminEmailHtml } from '@/lib/tradingPlan/emailContent';

// חייב תמיד להיות דינמי - ראוט GET ציבורי בלי headers/cookies שגם כותב לדאטהבייס,
// אסור שייתפס בקאש סטטי של Next.js
export const dynamic = 'force-dynamic';

async function sendEmail(apiKey: string, to: string, subject: string, html: string, from: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    console.error(`שגיאה בשליחת מייל התראת ביטול תזכורות אל ${to}`, await res.text());
    return false;
  }
  return true;
}

function confirmationPage(message: string): NextResponse {
  const html = `<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>מסחר אחראי במניות</title></head>
<body style="margin:0;background:#0b0f18;color:#E9ECF2;font-family:Arial,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center;">
  <div style="max-width:420px;">
    <div style="font-size:34px;margin-bottom:14px;">✓</div>
    <p style="font-size:15px;line-height:1.7;">${message}</p>
    <a href="https://www.shirandimor.com" style="display:inline-block;margin-top:20px;color:#4FC9C4;text-decoration:none;font-size:13px;">חזרה לאתר ←</a>
  </div>
</body>
</html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// GET - נלחץ מתוך לינק "להפסיק לקבל תזכורות אלה" (במייל, ובעמוד המעקב האישי) - עובד גם למנוי וגם ללא-מנוי.
// מסמן שלא לשלוח יותר תזכורות מעקב, ומודיע לשירן במייל כדי שתוכל ליזום פנייה אישית ולקבל פידבק.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return confirmationPage('חסר מזהה - לא הצלחנו לבצע את הבקשה.');

  const { data: row } = await supabaseAdmin
    .from('trading_plan_responses')
    .select('id, name, phone, email, progress_emails_opted_out')
    .eq('id', id)
    .maybeSingle();

  if (!row) return confirmationPage('העמוד לא נמצא.');

  if (!row.progress_emails_opted_out) {
    await supabaseAdmin
      .from('trading_plan_responses')
      .update({ progress_emails_opted_out: true, progress_emails_opted_out_at: new Date().toISOString() })
      .eq('id', id);

    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      await sendEmail(
        apiKey,
        'shiran@shirandimor.com',
        `${row.name || 'מישהו/י'} ביטל/ה תזכורות מעקב`,
        buildProgressUnsubscribeAdminEmailHtml(row),
        'התראות האתר <onboarding@resend.dev>'
      ).catch(() => false);
    }
  }

  return confirmationPage('התזכורות הופסקו בהצלחה. עמוד המעקב האישי שלך עדיין פתוח ופעיל בכל זמן - פשוט לא נשלח יותר תזכורות במייל.');
}
