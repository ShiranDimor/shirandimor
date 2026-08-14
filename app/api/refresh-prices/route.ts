import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// רענון מחירים יזום מהדפדפן (בנוסף ל-cron היומי) - כדי שהמחיר יתעדכן במהלך היום כשמישהו פותח את התיק
const MIN_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export async function GET() {
  const { data: openTrades, error } = await supabaseAdmin
    .from('trades')
    .select('id, symbol, current_price_updated_at')
    .eq('status', 'open');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  const stale = (openTrades || []).filter((t) => {
    if (!t.current_price_updated_at) return true;
    return now - new Date(t.current_price_updated_at).getTime() > MIN_REFRESH_INTERVAL_MS;
  });

  const results: { symbol: string; price: number | null }[] = [];

  for (const trade of stale) {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${trade.symbol}&token=${process.env.FINNHUB_API_KEY}`
      );
      const data = await res.json();
      const currentPrice = data.c;

      if (currentPrice && currentPrice > 0) {
        await supabaseAdmin
          .from('trades')
          .update({ current_price: currentPrice, current_price_updated_at: new Date().toISOString() })
          .eq('id', trade.id);
        results.push({ symbol: trade.symbol, price: currentPrice });
      }
    } catch (e) {
      results.push({ symbol: trade.symbol, price: null });
    }
  }

  return NextResponse.json({ updated: results.length, results });
}
