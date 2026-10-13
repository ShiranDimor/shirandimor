import type { SupabaseClient } from '@supabase/supabase-js';

export type TradeToRealize = {
  id: string;
  direction: string;
  symbol: string;
  entry_price: number;
  stop_loss: number;
  shares_calculated: number;
  opened_at: string;
  parent_trade_id: string | null;
};

// ממזג עסקה למניה יחידה: מכירה חלקית יוצרת שבר "סגור" נפרד; כשהיתרה מתאפסת כל השברים מתאחדים לעסקה סגורה אחת עם מחיר יציאה וכניסה ממוצעים
// משותף לכפתורי הסגירה בעמוד הניהול ולסגירה האוטומטית כשסטופ לוס מופעל
export async function realizeShares(
  supabase: SupabaseClient,
  trade: TradeToRealize,
  sellShares: number,
  sellPrice: number,
  closedAtIso: string,
  createdBy?: string | null
) {
  const dirFactor = trade.direction === 'short' ? -1 : 1;
  const realizedForSlice = (sellPrice - trade.entry_price) * sellShares * dirFactor;
  const remaining = trade.shares_calculated - sellShares;

  if (remaining > 0) {
    await supabase.from('trades').insert({
      created_by: createdBy,
      direction: trade.direction,
      symbol: trade.symbol,
      entry_price: trade.entry_price,
      stop_loss: trade.stop_loss,
      risk_amount_usd: 0,
      status: 'closed',
      exit_price: sellPrice,
      shares_calculated: sellShares,
      realized_pnl_usd: realizedForSlice,
      parent_trade_id: trade.parent_trade_id || trade.id,
      opened_at: trade.opened_at,
      closed_at: closedAtIso,
    });
    await supabase.from('trades').update({ shares_calculated: remaining }).eq('id', trade.id);
    return;
  }

  const rootId = trade.parent_trade_id || trade.id;
  const { data: siblings } = await supabase
    .from('trades')
    .select('id, shares_calculated, exit_price, realized_pnl_usd')
    .eq('parent_trade_id', rootId)
    .neq('id', trade.id);

  const allSiblings = siblings || [];
  const totalShares = allSiblings.reduce((s, x) => s + x.shares_calculated, 0) + sellShares;
  const weightedExit = (allSiblings.reduce((s, x) => s + x.shares_calculated * (x.exit_price ?? 0), 0) + sellShares * sellPrice) / totalShares;
  const totalPnl = allSiblings.reduce((s, x) => s + (x.realized_pnl_usd ?? 0), 0) + realizedForSlice;

  await supabase.from('trades').update({
    status: 'closed',
    shares_calculated: totalShares,
    exit_price: weightedExit,
    realized_pnl_usd: totalPnl,
    closed_at: closedAtIso,
  }).eq('id', trade.id);

  if (allSiblings.length > 0) {
    await supabase.from('trades').delete().in('id', allSiblings.map((s) => s.id));
  }
}
