import type { SupabaseClient } from '@supabase/supabase-js';
import { realizeShares, type TradeToRealize } from '@/lib/tradeClose';
import { notifyTradesClosed, type ClosedTradeInfo } from '@/lib/tradeClosedAlert';

// בודק אם עסקאות פתוחות בתיק האמיתי (trades, לא יומן מנויים) הגיעו למחיר הסטופ לוס שלהן
// אחרי עדכון מחיר - ואם כן, שולח מייל התראה מיידי. מסמן stop_loss_alert_sent כדי שלא תישלח
// התראה כפולה על אותה עסקה בכל ריענון מחיר נוסף - רק אם מחיר הסטופ עצמו משתנה (עריכה) זה מתאפס.
// בנוסף, עסקה שהגיעה לסטופ נסגרת אוטומטית בתיק - במחיר הסטופ ובתאריך שבו זה זוהה - בדיוק כמו
// לחיצה על "⚡ סגירה" בעמוד הניהול (כולל איחוד מכירות חלקיות). אם המחיר בפועל היה שונה (פער פתיחה),
// אפשר לתקן את מחיר היציאה דרך עריכת העסקה הסגורה

// גם אם המחיר כבר מתחת לסטופ (פער פתיחה) - העסקה נסגרת במחיר הסטופ עצמו.
// המנויים מקבלים על זה את מייל "עסקה נסגרה" הכללי (lib/tradeClosedAlert.ts)

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
  const closed = await closeAtStop(supabaseAdmin, breached.map((t) => t.id));
  await notifyTradesClosed(closed);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY לא מוגדר - לא ניתן לשלוח התראת סטופ לוס');
    return;
  }

  const lines = breached.map((t) => {
    const dirLabel = t.direction === 'long' ? 'לונג' : 'שורט';
    return `${t.symbol} (${dirLabel}) - סטופ: $${t.stop_loss} · מחיר נוכחי: $${t.current_price} · העסקה נסגרה במחיר הסטופ`;
  });

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: 'התראות האתר <noreply@shirandimor.com>',
        to: 'shiran@shirandimor.com',
        subject: breached.length === 1 ? `⚠️ סטופ לוס הופעל - ${breached[0].symbol}` : `⚠️ סטופ לוס הופעל ב-${breached.length} עסקאות`,
        text: `${breached.length === 1 ? 'העסקה הבאה הגיעה' : 'העסקאות הבאות הגיעו'} למחיר הסטופ לוס שלה${breached.length === 1 ? '' : 'ן'} ונסגר${breached.length === 1 ? 'ה' : 'ו'} אוטומטית בתיק במחיר הסטופ ובתאריך של היום:\n\n${lines.join('\n')}\n\nאם מחיר היציאה בפועל שונה (למשל פער פתיחה), אפשר לתקן בעריכת העסקה הסגורה.\n\nלתיק: https://www.shirandimor.com/admin/trades`,
      }),
    });
    if (!res.ok) console.error('שגיאה בשליחת מייל התראת סטופ לוס', await res.text());
  } catch (e) {
    console.error('שגיאה בשליחת מייל התראת סטופ לוס', e);
  }

}

// סוגר כל עסקה שהגיעה לסטופ במחיר הסטופ, בתאריך של עכשיו, ומחזיר את פרטי העסקאות שנסגרו
async function closeAtStop(supabaseAdmin: SupabaseClient, ids: string[]): Promise<ClosedTradeInfo[]> {
  const closed: ClosedTradeInfo[] = [];
  const { data: rows, error } = await supabaseAdmin
    .from('trades')
    .select('id, direction, symbol, entry_price, stop_loss, shares_calculated, opened_at, parent_trade_id, status')
    .in('id', ids);
  if (error) {
    console.error('שגיאה בטעינת עסקאות לסגירה אוטומטית בסטופ', error);
    return closed;
  }

  const closedAtIso = new Date().toISOString();
  for (const row of rows || []) {
    if (row.status !== 'open') continue;
    try {
      await realizeShares(supabaseAdmin, row as TradeToRealize, row.shares_calculated, row.stop_loss, closedAtIso);
      // מחיר היציאה הסופי (משוקלל אם היו מכירות חלקיות קודם)
      const { data: after } = await supabaseAdmin.from('trades').select('exit_price').eq('id', row.id).single();
      closed.push({
        symbol: row.symbol,
        direction: row.direction,
        entry_price: row.entry_price,
        exit_price: after?.exit_price ?? row.stop_loss,
        byStop: true,
      });
    } catch (e) {
      console.error(`שגיאה בסגירה אוטומטית של ${row.symbol} בסטופ`, e);
    }
  }
  return closed;
}
