import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: openTrades, error } = await supabaseAdmin
    .from('trades')
    .select('id, symbol')
    .eq('status', 'open');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: { symbol: string; price: number | null }[] = [];

  for (const trade of openTrades || []) {
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
