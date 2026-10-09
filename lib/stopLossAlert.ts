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

async function notifySubscribers(breached: TradeForAlert[], apiKey: string, lines: string[]) {
  const recipients = SUBSCRIBER_BROADCAST_LIVE
    ? Array.from((await getActiveSubscriberContacts()).emails)
    : [SUBSCRIBER_BROADCAST_TEST_RECIPIENT];

  if (recipients.length === 0) return;

  const subject = breached.length === 1
    ? `⚠️ סטופ לוס הופעל - ${breached[0].symbol}`
    : `⚠️ סטופ לוס הופעל ב-${breached.length} עסקאות`;
  const text = `חברים, שימו לב - הסטופ לוס הופעל בעסקה/ות הפתוחה/ות הבאה/ות בתיק:\n\n${lines.join('\n')}\n\nלתיק המלא: https://www.shirandimor.com/portfolio`;

  await Promise.allSettled(
    recipients.map(async (to) => {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ from: 'התראות האתר <noreply@shirandimor.com>', to, subject, text }),
        });
        if (!res.ok) console.error(`שגיאה בשליחת התראת סטופ לוס למנוי ${to}`, await res.text());
      } catch (e) {
        console.error(`שגיאה בשליחת התראת סטופ לוס למנוי ${to}`, e);
      }
    })
  );
}
