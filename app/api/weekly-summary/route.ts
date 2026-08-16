import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Trade = {
  symbol: string;
  direction: string;
  entry_price: number;
  exit_price: number | null;
  stop_loss: number;
  shares_calculated: number;
  realized_pnl_usd: number | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
};

const GROW_LINK = 'https://pay.grow.link/200a7cdcb258ee6ffdea0f423a1ace0e-MzE4MDU5OA';
const GROUP_NAME = 'מדברים עסקאות';
const SITE_URL = 'https://www.shirandimor.com';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('he-IL');
}

function pct(t: Trade) {
  const exit = t.exit_price;
  if (exit === null) return null;
  const dirFactor = t.direction === 'short' ? -1 : 1;
  return ((exit - t.entry_price) / t.entry_price) * 100 * dirFactor;
}

function tradeRowHtml(t: Trade, kind: 'open' | 'closed') {
  const dirLabel = t.direction === 'long' ? 'לונג' : 'שורט';
  const dirColor = t.direction === 'long' ? '#4FB876' : '#C9635E';

  if (kind === 'open') {
    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:700;">${t.symbol}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;color:${dirColor};font-weight:600;">${dirLabel}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;">$${t.entry_price}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;">$${t.stop_loss}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#888;font-size:13px;">${formatDate(t.opened_at)}</td>
      </tr>`;
  }

  const p = pct(t);
  const usd = t.realized_pnl_usd ?? 0;
  const resultColor = usd >= 0 ? '#4FB876' : '#C9635E';
  return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:700;">${t.symbol}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;color:${dirColor};font-weight:600;">${dirLabel}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;">$${t.entry_price} ← $${t.exit_price}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;color:${resultColor};font-weight:700;">
        ${p !== null ? `${p >= 0 ? '+' : ''}${p.toFixed(2)}%` : '—'}
        <span style="color:#888;font-weight:400;font-size:12.5px;">(${usd >= 0 ? '+' : '-'}$${Math.abs(usd).toFixed(0)})</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#888;font-size:13px;">${formatDate(t.closed_at as string)}</td>
    </tr>`;
}

const TEMP_DEBUG_TOKEN = 'debug-verify-branding-2026-08-16';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && authHeader !== `Bearer ${TEMP_DEBUG_TOKEN}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const { data: allTrades, error } = await supabaseAdmin
    .from('trades')
    .select('symbol, direction, entry_price, exit_price, stop_loss, shares_calculated, realized_pnl_usd, status, opened_at, closed_at');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const trades: Trade[] = allTrades || [];

  const openedThisWeekStillOpen = trades
    .filter((t) => t.status === 'open' && new Date(t.opened_at) >= weekAgo)
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());

  const closedThisWeek = trades
    .filter((t) => t.status === 'closed' && t.closed_at && new Date(t.closed_at) >= weekAgo)
    .sort((a, b) => new Date(b.closed_at as string).getTime() - new Date(a.closed_at as string).getTime());

  const wins = closedThisWeek.filter((t) => (t.realized_pnl_usd ?? 0) >= 0);
  const totalPnl = closedThisWeek.reduce((s, t) => s + (t.realized_pnl_usd ?? 0), 0);
  const winRate = closedThisWeek.length > 0 ? (wins.length / closedThisWeek.length) * 100 : null;
  const totalOpenNow = trades.filter((t) => t.status === 'open').length;

  const rangeLabel = `${formatDate(weekAgo.toISOString())} - ${formatDate(now.toISOString())}`;

  const html = `
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">

      <div style="background:#111318;padding:24px;text-align:center;">
        <img src="${SITE_URL}/shiran-photo.jpg" width="56" height="56" alt="שירן דימור" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #4fc9c4;margin-bottom:12px;" />
        <div style="color:#fff;font-size:18px;font-weight:700;">מסחר <span style="color:#4fc9c4;">אחראי</span> במניות</div>
        <div style="color:#9C8FD9;font-size:12.5px;letter-spacing:0.02em;margin-top:6px;">שירן דימור · קבוצת הסוחרים &quot;${GROUP_NAME}&quot;</div>
        <div style="color:#fff;font-size:20px;font-weight:700;margin-top:14px;">סיכום שבועי</div>
        <div style="color:#aaa;font-size:13px;margin-top:4px;">${rangeLabel}</div>
      </div>

      <div style="display:flex;padding:20px 16px;gap:8px;border-bottom:1px solid #eee;">
        <table style="width:100%;border-collapse:collapse;"><tr>
          <td style="text-align:center;padding:8px;">
            <div style="font-size:20px;font-weight:700;color:${totalPnl >= 0 ? '#4FB876' : '#C9635E'};">${totalPnl >= 0 ? '+' : '-'}$${Math.abs(totalPnl).toFixed(0)}</div>
            <div style="font-size:11.5px;color:#888;margin-top:2px;">תוצאה השבוע</div>
          </td>
          <td style="text-align:center;padding:8px;">
            <div style="font-size:20px;font-weight:700;color:#111;">${closedThisWeek.length}</div>
            <div style="font-size:11.5px;color:#888;margin-top:2px;">עסקאות נסגרו</div>
          </td>
          <td style="text-align:center;padding:8px;">
            <div style="font-size:20px;font-weight:700;color:#111;">${winRate !== null ? winRate.toFixed(0) + '%' : '—'}</div>
            <div style="font-size:11.5px;color:#888;margin-top:2px;">אחוז הצלחה</div>
          </td>
          <td style="text-align:center;padding:8px;">
            <div style="font-size:20px;font-weight:700;color:#111;">${totalOpenNow}</div>
            <div style="font-size:11.5px;color:#888;margin-top:2px;">עסקאות פתוחות כרגע</div>
          </td>
        </tr></table>
      </div>

      <div style="padding:20px 16px 4px;">
        <div style="font-size:14.5px;font-weight:700;color:#111;margin-bottom:10px;">🟢 נפתחו השבוע ונשארו פתוחות (${openedThisWeekStillOpen.length})</div>
        ${openedThisWeekStillOpen.length === 0 ? `<div style="font-size:13px;color:#888;padding-bottom:16px;">לא נפתחו עסקאות חדשות השבוע</div>` : `
        <table style="width:100%;border-collapse:collapse;font-size:13.5px;">
          <tr style="color:#888;font-size:11.5px;text-align:right;">
            <th style="padding:0 12px 6px;text-align:right;">סימבול</th>
            <th style="padding:0 12px 6px;text-align:right;">כיוון</th>
            <th style="padding:0 12px 6px;text-align:right;">כניסה</th>
            <th style="padding:0 12px 6px;text-align:right;">סטופ</th>
            <th style="padding:0 12px 6px;text-align:right;">תאריך</th>
          </tr>
          ${openedThisWeekStillOpen.map((t) => tradeRowHtml(t, 'open')).join('')}
        </table>`}
      </div>

      <div style="padding:20px 16px 4px;">
        <div style="font-size:14.5px;font-weight:700;color:#111;margin-bottom:10px;">✔ נסגרו השבוע (${closedThisWeek.length})</div>
        ${closedThisWeek.length === 0 ? `<div style="font-size:13px;color:#888;padding-bottom:16px;">לא נסגרו עסקאות השבוע</div>` : `
        <table style="width:100%;border-collapse:collapse;font-size:13.5px;">
          <tr style="color:#888;font-size:11.5px;text-align:right;">
            <th style="padding:0 12px 6px;text-align:right;">סימבול</th>
            <th style="padding:0 12px 6px;text-align:right;">כיוון</th>
            <th style="padding:0 12px 6px;text-align:right;">כניסה ← יציאה</th>
            <th style="padding:0 12px 6px;text-align:right;">תוצאה</th>
            <th style="padding:0 12px 6px;text-align:right;">תאריך</th>
          </tr>
          ${closedThisWeek.map((t) => tradeRowHtml(t, 'closed')).join('')}
        </table>`}
      </div>

      <div style="padding:6px 16px 24px;text-align:center;">
        <div style="background:#f0faf9;border:1px solid #cdeeeb;border-radius:12px;padding:18px 16px;">
          <div style="font-size:14.5px;font-weight:700;color:#111;margin-bottom:10px;">🚀 מצטרפים לקבוצת הסוחרים &quot;${GROUP_NAME}&quot;</div>
          <a href="${GROW_LINK}" target="_blank" style="display:inline-block;background:#111318;color:#4fc9c4;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:8px;">הצטרפות עכשיו</a>
        </div>
        <div style="font-size:11px;color:#aaa;margin-top:14px;">הסיכום הזה נועד לעזור לך לנסח פוסט שבועי לקבוצות - העתיקי את מה שרלוונטי.</div>
      </div>

    </div>
  </div>`;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY לא מוגדר - לא ניתן לשלוח סיכום שבועי');
    return NextResponse.json({ ok: true, sent: false });
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'סיכום שבועי <noreply@shirandimor.com>',
        to: 'shiran@shirandimor.com',
        subject: `סיכום שבועי לקבוצות · ${rangeLabel}`,
        html,
      }),
    });

    if (!res.ok) {
      console.error('שגיאה בשליחת הסיכום השבועי', await res.text());
      return NextResponse.json({ ok: true, sent: false });
    }

    return NextResponse.json({
      ok: true,
      sent: true,
      openedThisWeekStillOpen: openedThisWeekStillOpen.length,
      closedThisWeek: closedThisWeek.length,
    });
  } catch (e) {
    console.error('שגיאה בשליחת הסיכום השבועי', e);
    return NextResponse.json({ ok: true, sent: false });
  }
}
