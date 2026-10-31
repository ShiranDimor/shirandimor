import { getActiveSubscriberContacts } from '@/lib/subscriberStatus';
import { sendPushToActiveSubscribers, sendPushToNonSubscribers } from '@/lib/webPush';

// מייל "עסקה נסגרה" לכל המנויים הפעילים + לשירן - נשלח בכל סגירה מלאה של עסקה בתיק האמיתי
// (סגירה ידנית בכפתור "⚡ סגירה" או סגירה אוטומטית בסטופ לוס), עם ציון אם נסגרה ברווח או בהפסד.
// מכירה חלקית לא שולחת מייל - רק כשהעסקה כולה נסגרת

// מופעל - המייל יוצא לכל המנויים הפעילים + לשירן. להחזרה למצב בדיקה (רק לכתובת הבדיקה): false
const TRADE_CLOSED_BROADCAST_LIVE = true;
export const SUBSCRIBER_BROADCAST_TEST_RECIPIENT = 'shiran@shirandizi.com';
const OWNER_EMAIL = 'shiran@shirandimor.com';
const SITE_URL = 'https://www.shirandimor.com';

export type ClosedTradeInfo = {
  symbol: string;
  direction: string;
  entry_price: number;
  exit_price: number;
  byStop?: boolean;
};

function fmtPrice(n: number) {
  return `$${Number(n.toFixed(4))}`;
}

// עוטף את גוף המייל במסמך HTML מלא עם color-scheme "light only" - בלי זה חלק מלקוחות המייל
// (בעיקר Gmail) מפעילים מצב כהה אוטומטי על HTML גולמי והופכים את הרקע הבהיר לכהה בלי לגעת
// בטקסט הכהה שנועד לרקע הבהיר המקורי, ויוצרים טקסט כהה על רקע כהה שאי אפשר לקרוא
function wrapEmail(bodyHtml: string): string {
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="color-scheme" content="light only" /><meta name="supported-color-schemes" content="light only" /></head><body style="margin:0;padding:0;">${bodyHtml}</body></html>`;
}

function buildTradeClosedContent(t: ClosedTradeInfo) {
  const dirFactor = t.direction === 'short' ? -1 : 1;
  const pct = ((t.exit_price - t.entry_price) / t.entry_price) * 100 * dirFactor;
  const isProfit = pct >= 0;
  const dirLabel = t.direction === 'short' ? 'שורט' : 'לונג';
  const resultLabel = isProfit ? 'ברווח' : 'בהפסד';
  const pctLabel = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
  const reason = t.byStop ? 'העסקה נסגרה בהגעה למחיר הסטופ לוס.' : '';

  const subject = `${isProfit ? '✅' : '🔻'} עסקה נסגרה ${resultLabel} - ${t.symbol}`;
  const details = [
    `מניה: ${t.symbol} (${dirLabel})`,
    `מחיר כניסה: ${fmtPrice(t.entry_price)}`,
    `מחיר יציאה: ${fmtPrice(t.exit_price)}`,
    `תוצאה: ${pctLabel} (${resultLabel})`,
  ];
  const text = `חברים, עסקה בתיק נסגרה ${resultLabel}:\n\n${details.join('\n')}${reason ? `\n\n${reason}` : ''}\n\nלתיק המלא: ${SITE_URL}/portfolio`;

  const accent = isProfit ? '#3DDC84' : '#FF5C5C';
  const boxBg = isProfit ? '#1B2A20' : '#2A1B1B';
  const boxBorder = isProfit ? '#2E4A38' : '#4A2E2E';

  const html = wrapEmail(`
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#121013; padding:24px 12px;">
    <div style="max-width:600px;margin:0 auto;background:#211F23;border-radius:14px;overflow:hidden;border:1px solid #332E35;">
      <div style="background:#17151A;padding:24px;text-align:center;">
        <img src="${SITE_URL}/shiran-photo.jpg" width="56" height="56" alt="שירן דימור" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #FF2D78;margin-bottom:12px;" />
        <div style="color:#fff;font-size:18px;font-weight:700;">מסחר <span style="color:#FF2D78;">אחראי</span> במניות</div>
        <div style="color:${isProfit ? '#4EE0A0' : '#FF8A8A'};font-size:15px;font-weight:700;margin-top:10px;">${isProfit ? '✅' : '🔻'} עסקה נסגרה ${resultLabel}</div>
      </div>
      <div style="padding:24px;">
        <p style="font-size:14px;color:#F2EFF1;line-height:1.7;margin:0 0 16px;">חברים, עסקה בתיק נסגרה ${resultLabel}:</p>
        <div style="background:${boxBg};border:1px solid ${boxBorder};border-radius:10px;padding:14px 16px;margin-bottom:16px;">
          <div style="font-size:18px;font-weight:700;color:#F2EFF1;margin-bottom:8px;">${t.symbol} <span style="font-size:13px;color:#9A939B;font-weight:400;">(${dirLabel})</span></div>
          <div style="font-size:14px;color:#F2EFF1;line-height:1.9;">מחיר כניסה: ${fmtPrice(t.entry_price)}<br />מחיר יציאה: ${fmtPrice(t.exit_price)}</div>
          <div style="font-size:20px;font-weight:700;color:${accent};margin-top:8px;"><span dir="ltr" style="unicode-bidi:isolate;">${pctLabel}</span> · ${resultLabel}</div>
        </div>
        ${reason ? `<p style="font-size:13px;color:#C9C4C9;margin:0 0 16px;">${reason}</p>` : ''}
        <a href="${SITE_URL}/portfolio" style="display:block;text-align:center;background:linear-gradient(90deg,#FF2D78,#FFB648);color:#1A181C;text-decoration:none;font-weight:700;padding:13px;border-radius:10px;">לתיק המלא ←</a>
      </div>
    </div>
  </div>`);

  return { subject, text, html };
}

async function sendEmails(apiKey: string, recipients: string[], subject: string, text: string, html: string) {
  await Promise.allSettled(
    recipients.map(async (to) => {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ from: 'שירן דימור - מסחר אחראי במניות <noreply@shirandimor.com>', to, subject, text, html }),
        });
        if (!res.ok) console.error(`שגיאה בשליחת מייל סגירת עסקה ל-${to}`, await res.text());
      } catch (e) {
        console.error(`שגיאה בשליחת מייל סגירת עסקה ל-${to}`, e);
      }
    })
  );
}

// שולח מייל "עסקה נסגרה" על כל עסקה שנסגרה - לכל המנויים הפעילים + לשירן (או רק לכתובת הבדיקה כל עוד לא הופעל)
export async function notifyTradesClosed(trades: ClosedTradeInfo[]) {
  if (trades.length === 0) return;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY לא מוגדר - לא ניתן לשלוח מייל סגירת עסקה');
    return;
  }

  const recipients = TRADE_CLOSED_BROADCAST_LIVE
    ? Array.from(new Set([...(await getActiveSubscriberContacts()).emails, OWNER_EMAIL]))
    : [SUBSCRIBER_BROADCAST_TEST_RECIPIENT];

  for (const t of trades) {
    const { subject, text, html } = buildTradeClosedContent(t);
    await sendEmails(apiKey, recipients, subject, text, html);
  }

  if (TRADE_CLOSED_BROADCAST_LIVE) {
    for (const t of trades) {
      const dirFactor = t.direction === 'short' ? -1 : 1;
      const pct = ((t.exit_price - t.entry_price) / t.entry_price) * 100 * dirFactor;
      const isProfit = pct >= 0;
      const title = `${isProfit ? '✅' : '🔻'} עסקה נסגרה ${isProfit ? 'ברווח' : 'בהפסד'} - ${t.symbol}`;
      const pctLabel = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;

      // המנויים מקבלים את התוצאה בלבד וקישור לתיק. מי שאינו מנוי מקבל את אותה תוצאה (בכוונה -
      // זו ההוכחה שמביאה הצטרפות) אבל עם משפט שמניע הצטרפות וקישור לניסיון במקום לתיק עצמו
      await sendPushToActiveSubscribers({ title, body: pctLabel, url: '/portfolio' }, 'trade');
      await sendPushToNonSubscribers({ title, body: `${pctLabel} · חודש ראשון ב-₪1 ←`, url: '/subscribe' }, 'trade');
    }
  }
}

// שליחת שתי דוגמאות (רווח + הפסד בסטופ) לכתובת הבדיקה בלבד - לא תלוי בדגל ההפעלה,
// כדי שלחיצה על כפתור הבדיקה לא תוכל לשלוח בטעות לכל המנויים
export async function sendSampleTradeClosedAlerts() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY לא מוגדר');

  const samples: ClosedTradeInfo[] = [
    { symbol: 'AAPL', direction: 'long', entry_price: 210, exit_price: 231.5 },
    { symbol: 'CATG', direction: 'long', entry_price: 9.85, exit_price: 9.3, byStop: true },
  ];
  for (const t of samples) {
    const { subject, text, html } = buildTradeClosedContent(t);
    await sendEmails(apiKey, [SUBSCRIBER_BROADCAST_TEST_RECIPIENT], `[דוגמה] ${subject}`, text, html);
  }
}
