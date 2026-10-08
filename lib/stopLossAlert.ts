import type { SupabaseClient } from '@supabase/supabase-js';

// בודק אם עסקאות פתוחות בתיק האמיתי (trades, לא יומן מנויים) הגיעו למחיר הסטופ לוס שלהן
// אחרי עדכון מחיר - ואם כן, שולח מייל התראה מיידי. מסמן stop_loss_alert_sent כדי שלא תישלח
// התראה כפולה על אותה עסקה בכל ריענון מחיר נוסף - רק אם מחיר הסטופ עצמו משתנה (עריכה) זה מתאפס
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
}
