import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// עדכון מחירים יזום לכל האתר: כפתור אדמין שמעדכן בבת אחת את כל העסקאות הפתוחות -
// גם בתיק שמוצג למנויים/לידים וגם ביומן האישי של כל מנוי
export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: 'לא מחוברים' }, { status: 401 });
  }

  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });
  }

  const [{ data: openTrades, error: tradesError }, { data: openEntries, error: entriesError }] = await Promise.all([
    supabaseAdmin.from('trades').select('id, symbol').eq('status', 'open'),
    supabaseAdmin.from('journal_entries').select('id, symbol').eq('status', 'open'),
  ]);

  if (tradesError || entriesError) {
    return NextResponse.json({ error: (tradesError || entriesError)?.message }, { status: 500 });
  }

  const symbols = Array.from(new Set([...(openTrades || []), ...(openEntries || [])].map((t) => t.symbol)));
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
  let tradesUpdated = 0;
  let entriesUpdated = 0;

  await Promise.all(
    (openTrades || [])
      .filter((t) => prices[t.symbol])
      .map(async (t) => {
        const { error } = await supabaseAdmin
          .from('trades')
          .update({ current_price: prices[t.symbol], current_price_updated_at: nowIso })
          .eq('id', t.id);
        if (!error) tradesUpdated++;
      })
  );

  await Promise.all(
    (openEntries || [])
      .filter((e) => prices[e.symbol])
      .map(async (e) => {
        const { error } = await supabaseAdmin
          .from('journal_entries')
          .update({ current_price: prices[e.symbol], current_price_updated_at: nowIso })
          .eq('id', e.id);
        if (!error) entriesUpdated++;
      })
  );

  return NextResponse.json({
    symbolsFetched: Object.keys(prices).length,
    symbolsAttempted: symbols.length,
    tradesUpdated,
    entriesUpdated,
  });
}
