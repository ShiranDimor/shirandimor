import { diagnoseCalendarConnection, exchangeGoogleAuthCode } from '@/lib/googleCalendar';
import { redirectUri, verifyState } from '@/lib/googleReconnect';

export const dynamic = 'force-dynamic';

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function page(body: string) {
  return new Response(
    `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>חיבור יומן Google</title>
<style>body{font-family:Rubik,system-ui,sans-serif;background:#1A181C;color:#F5F3F4;max-width:560px;margin:0 auto;padding:28px 18px;line-height:1.65}h1{font-size:22px}.ok{color:#3DDC84}.bad{color:#FF5C5C}textarea{width:100%;min-height:110px;background:#2B272D;color:#F5F3F4;border:1px solid #433D46;border-radius:10px;padding:12px;font-size:14px;direction:ltr}button{margin-top:10px;width:100%;padding:13px;border:0;border-radius:999px;background:linear-gradient(90deg,#FF2D78,#FFB648);color:#1A181C;font-weight:700;font-size:15px}ol{padding-right:20px}code{background:#2B272D;padding:2px 6px;border-radius:6px}</style></head><body>${body}</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}

// גוגל מחזירה לכאן אחרי האישור. מחליפים את הקוד בטוקן קבוע, בודקים שהוא עובד, ומציגים אותו להעתקה ל-Vercel
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code') || '';
  const state = searchParams.get('state') || '';
  const error = searchParams.get('error');
  if (error) return page(`<h1 class="bad">החיבור בוטל</h1><p>גוגל החזירה: <code>${esc(error)}</code>. אפשר לחזור לעמוד החיבור ולנסות שוב.</p>`);
  if (!code || !verifyState(state)) return page('<h1 class="bad">הקישור פג תוקף</h1><p>יש להתחיל שוב מעמוד הניהול <code>/admin/google-calendar</code>.</p>');

  const result = await exchangeGoogleAuthCode(code, redirectUri(request.url));
  if (!result.refreshToken) {
    return page(`<h1 class="bad">לא הצלחנו לקבל הרשאה</h1><p>שגיאה: <code>${esc(result.error || '')}</code></p>`);
  }
  const test = await diagnoseCalendarConnection(result.refreshToken);
  const token = esc(result.refreshToken);
  return page(`
<h1 class="ok">✓ היומן חובר${test.ok ? ' ונבדק - עובד' : ''}</h1>
${test.ok ? '' : `<p class="bad">שימי לב: בבדיקה החיבור עדיין נכשל (${esc(test.step)}: ${esc(test.detail)}).</p>`}
<p>נשאר צעד אחד ב-Vercel:</p>
<ol>
<li>מעתיקים את הטוקן שבתיבה (כפתור ההעתקה למטה).</li>
<li>ב-Vercel: הפרויקט ← Settings ← Environment Variables ← <code>GOOGLE_CALENDAR_REFRESH_TOKEN</code> ← Edit ← מדביקים במקום הערך הישן ← Save.</li>
<li>Deployments ← בפריסה האחרונה ⋯ ← Redeploy.</li>
</ol>
<textarea id="t" readonly>${token}</textarea>
<button onclick="navigator.clipboard.writeText(document.getElementById('t').value).then(()=>this.textContent='הועתק ✓')">העתקת הטוקן</button>
<p style="font-size:13px;color:#8A8389;margin-top:18px">זה מפתח גישה ליומן שלך - לא לשלוח אותו לאף אחד ולא לשמור אותו במקום אחר.</p>`);
}
