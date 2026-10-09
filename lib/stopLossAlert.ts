import type { SupabaseClient } from '@supabase/supabase-js';
import { getActiveSubscriberContacts } from '@/lib/subscriberStatus';

// בודק אם עסקאות פתוחות בתיק האמיתי (trades, לא יומן מנויים) הגיעו למחיר הסטופ לוס שלהן
// אחרי עדכון מחיר - ואם כן, שולח מייל התראה מיידי. מסמן stop_loss_alert_sent כדי שלא תישלח
// התראה כפולה על אותה עסקה בכל ריענון מחיר נוסף - רק אם מחיר הסטופ עצמו משתנה (עריכה) זה מתאפס

// שליחת ההתראה לכל המנויים עדיין לא הופעלה בפועל - כל עוד הדגל הזה false, ההודעה שמנוסחת
// למנויים יוצאת רק לכתובת הבדיקה של שירן, כדי שתוכל לראות איך זה נראה אצל מנוי לפני
// שמפעילים את זה לכולם. להפעלה בפועל לכל המנויים הפעילים: להחליף ל-true.
const SUBSCRIBER_BROADCAST_LIVE = false;
const SUBSCRIBER_BROADCAST_TEST_RECIPIENT = 'shiran@shirandizi.com';

type TradeForAlert = {
  id: string;
  symbol: string;
  direction: string;
  stop_loss: number;
  current_price: number;
  stop_loss_alert_sent: boolean;
};

function isBreached(t: TradeForAlert) {
  return t.direction === 'short' ? t.current_price >= t.stop_loss : t.current_price <= t.stop_loss;
}

export async function checkStopLossBreaches(supabaseAdmin: SupabaseClient, trades: TradeForAlert[]) {
  const breached = trades.filter((t) => !t.stop_loss_alert_sent && isBreached(t));
  if (breached.length === 0) return;

  await supabaseAdmin.from('trades').update({ stop_loss_alert_sent: true }).in('id', breached.map((t) => t.id));

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY לא מוגדר - לא ניתן לשלוח התראת סטופ לוס');
    return;
  }

  const lines = breached.map((t) => {
    const dirLabel = t.direction === 'long' ? 'לונג' : 'שורט';
    return `${t.symbol} (${dirLabel}) - סטופ: $${t.stop_loss} · מחיר נוכחי: $${t.current_price}`;
  });

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: 'התראות האתר <noreply@shirandimor.com>',
        to: 'shiran@shirandimor.com',
        subject: breached.length === 1 ? `⚠️ סטופ לוס הופעל - ${breached[0].symbol}` : `⚠️ סטופ לוס הופעל ב-${breached.length} עסקאות`,
        text: `העסקאות הבאות הגיעו למחיר הסטופ לוס שלהן:\n\n${lines.join('\n')}\n\nלתיק: https://www.shirandimor.com/admin/trades`,
      }),
    });
    if (!res.ok) console.error('שגיאה בשליחת מייל התראת סטופ לוס', await res.text());
  } catch (e) {
    console.error('שגיאה בשליחת מייל התראת סטופ לוס', e);
  }

  await notifySubscribers(breached, apiKey, lines);
}

const SITE_URL = 'https://www.shirandimor.com';

// עוטף את גוף המייל במסמך HTML מלא עם color-scheme "light only" - בלי זה חלק מלקוחות המייל
// (בעיקר Gmail) מפעילים מצב כהה אוטומטי על HTML גולמי והופכים את הרקע הבהיר לכהה בלי לגעת
// בטקסט הכהה שנועד לרקע הבהיר המקורי, ויוצרים טקסט כהה על רקע כהה שאי אפשר לקרוא
function wrapEmail(bodyHtml: string): string {
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="color-scheme" content="light only" /><meta name="supported-color-schemes" content="light only" /></head><body style="margin:0;padding:0;">${bodyHtml}</body></html>`;
}

function buildSubscriberAlertContent(firstSymbol: string, count: number, lines: string[]) {
  const subject = count === 1 ? `⚠️ סטופ לוס הופעל - ${firstSymbol}` : `⚠️ סטופ לוס הופעל ב-${count} עסקאות`;
  const text = `חברים, שימו לב - הסטופ לוס הופעל בעסקה/ות הפתוחה/ות הבאה/ות בתיק:\n\n${lines.join('\n')}\n\nלתיק המלא: ${SITE_URL}/portfolio`;

  const html = wrapEmail(`
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">
      <div style="background:#111318;padding:24px;text-align:center;">
        <img src="${SITE_URL}/shiran-photo.jpg" width="56" height="56" alt="שירן דימור" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #4fc9c4;margin-bottom:12px;" />
        <div style="color:#fff;font-size:18px;font-weight:700;">מסחר <span style="color:#4fc9c4;">אחראי</span> במניות</div>
        <div style="color:#e2918c;font-size:15px;font-weight:700;margin-top:10px;">⚠️ סטופ לוס הופעל</div>
      </div>
      <div style="padding:24px;">
        <p style="font-size:14px;color:#222;line-height:1.7;margin:0 0 16px;">חברים, שימו לב - הסטופ לוס הופעל בעסקה/ות הפתוחה/ות הבאה/ות בתיק:</p>
        <div style="background:#fdf2f1;border:1px solid #f3d4d1;border-radius:10px;padding:4px 16px;margin-bottom:20px;">
          ${lines.map((line, i) => `<div style="font-size:14px;color:#8a3c37;font-weight:600;padding:10px 0;${i < lines.length - 1 ? 'border-bottom:1px solid #f3d4d1;' : ''}">${line}</div>`).join('')}
        </div>
        <a href="${SITE_URL}/portfolio" style="display:block;text-align:center;background:#4fc9c4;color:#08131a;text-decoration:none;font-weight:700;padding:13px;border-radius:10px;">לתיק המלא ←</a>
      </div>
    </div>
  </div>`);

  return { subject, text, html };
}

async function sendSubscriberAlertEmails(apiKey: string, recipients: string[], subject: string, text: string, html: string) {
  await Promise.allSettled(
    recipients.map(async (to) => {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ from: 'שירן דימור - מסחר אחראי במניות <noreply@shirandimor.com>', to, subject, text, html }),
        });
        if (!res.ok) console.error(`שגיאה בשליחת התראת סטופ לוס למנוי ${to}`, await res.text());
      } catch (e) {
        console.error(`שגיאה בשליחת התראת סטופ לוס למנוי ${to}`, e);
      }
    })
  );
}

async function notifySubscribers(breached: TradeForAlert[], apiKey: string, lines: string[]) {
  const recipients = SUBSCRIBER_BROADCAST_LIVE
    ? Array.from((await getActiveSubscriberContacts()).emails)
    : [SUBSCRIBER_BROADCAST_TEST_RECIPIENT];

  if (recipients.length === 0) return;

  const { subject, text, html } = buildSubscriberAlertContent(breached[0].symbol, breached.length, lines);
  await sendSubscriberAlertEmails(apiKey, recipients, subject, text, html);
}

// שליחת דוגמה ידנית של מייל התראת המנויים, בלי לחכות לחציית סטופ אמיתית - תמיד נשלחת רק
// לכתובת הבדיקה (לא תלוי בדגל SUBSCRIBER_BROADCAST_LIVE) כדי שלחיצה על כפתור בדיקה בטעות
// לא תוכל לשלוח בטעות לכל המנויים
export async function sendSampleSubscriberAlert() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY לא מוגדר');

  const sampleLine = 'AAPL (לונג) - סטופ: $220 · מחיר נוכחי: $218.5';
  const { subject, text, html } = buildSubscriberAlertContent('AAPL', 1, [sampleLine]);
  await sendSubscriberAlertEmails(apiKey, [SUBSCRIBER_BROADCAST_TEST_RECIPIENT], `[דוגמה] ${subject}`, text, html);
}
