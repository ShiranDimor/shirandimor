import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// רענון מחירים יזום מהדפדפן (בנוסף ל-cron היומי) - כדי שהמחיר יתעדכן במהלך היום כשמישהו פותח
// את התיק הציבורי או את היומן האישי שלו. מרענן גם עסקאות פתוחות בתיק וגם ביומנים של כל המנויים,
// ומושך כל סימבול מ-Finnhub פעם אחת בלבד כדי לא לשלוח בקשות כפולות
const MIN_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export async function GET() {
  const [{ data: openTrades, error: tradesError }, { data: openEntries, error: entriesError }] = await Promise.all([
    supabaseAdmin.from('trades').select('id, symbol, current_price_updated_at').eq('status', 'open'),
    supabaseAdmin.from('journal_entries').select('id, symbol, current_price_updated_at').eq('status', 'open'),
  ]);

  if (tradesError || entriesError) {
    return NextResponse.json({ error: (tradesError || entriesError)?.message }, { status: 500 });
  }

  const now = Date.now();
  const isStale = (updatedAt: string | null) => !updatedAt || now - new Date(updatedAt).getTime() > MIN_REFRESH_INTERVAL_MS;

  const staleTrades = (openTrades || []).filter((t) => isStale(t.current_price_updated_at));
  const staleEntries = (openEntries || []).filter((e) => isStale(e.current_price_updated_at));

  const symbols = Array.from(new Set([...staleTrades, ...staleEntries].map((t) => t.symbol)));
  const prices: Record<string, number> = {};

  for (const symbol of symbols) {
    try {
      const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${process.env.FINNHUB_API_KEY}`);
      const data = await res.json();
      if (data.c && data.c > 0) prices[symbol] = data.c;
    } catch (e) {
      // מתעלמים מסימבול שנכשל וממשיכים לשאר
    }
  }

  const nowIso = new Date().toISOString();

  const [tradeResults] = await Promise.all([
    Promise.all(
      staleTrades
        .filter((t) => prices[t.symbol])
        .map((t) =>
          supabaseAdmin.from('trades').update({ current_price: prices[t.symbol], current_price_updated_at: nowIso }).eq('id', t.id)
        )
    ),
    Promise.all(
      staleEntries
        .filter((e) => prices[e.symbol])
        .map((e) =>
          supabaseAdmin.from('journal_entries').update({ current_price: prices[e.symbol], current_price_updated_at: nowIso }).eq('id', e.id)
        )
    ),
  ]);

  return NextResponse.json({ updated: tradeResults.length, symbolsFetched: Object.keys(prices).length });
}
