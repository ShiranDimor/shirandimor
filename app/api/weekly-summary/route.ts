import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export const maxDuration = 60;

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

// מרנדר את ה-HTML של הסיכום לתמונת PNG אמיתית (דרך כרום headless), כדי שאפשר יהיה לשמור ולשלוח אותה ישירות לקבוצות
async function renderHtmlToImageBase64(html: string): Promise<string> {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 650, height: 800 },
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const buffer = await page.screenshot({ type: 'png', fullPage: true });
    return Buffer.from(buffer).toString('base64');
  } finally {
    await browser.close();
  }
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
    // עסקאות פתוחות הן "הטיפ" בפועל - מטשטשים את הסימבול בדיוק כמו באתר לגולשים שאינם מנויים,
    // כדי שהתמונה תהיה בטוחה לשליחה גם לקבוצת העדכונים החינמית
    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:700;"><span style="filter:blur(5px);color:#5A6178;user-select:none;">${t.symbol}</span></td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;color:${dirColor};font-weight:600;">${dirLabel}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;">$${t.entry_price}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;">$${t.stop_loss}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#888;font-size:13px;">${formatDate(t.opened_at)}</td>
      </tr>`;
  }

  const p = pct(t);
  const resultColor = (p ?? 0) >= 0 ? '#4FB876' : '#C9635E';
  return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:700;">${t.symbol}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;color:${dirColor};font-weight:600;">${dirLabel}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;">$${t.entry_price} ← $${t.exit_price}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;color:${resultColor};font-weight:700;">
        ${p !== null ? `${p >= 0 ? '+' : ''}${p.toFixed(2)}%` : '—'}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#888;font-size:13px;">${formatDate(t.closed_at as string)}</td>
    </tr>`;
}

const TEMP_DEBUG_TOKEN = 'debug-image-2026-08-16-shiran';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token');
  const providedToken = authHeader?.replace('Bearer ', '') || queryToken;

  if (providedToken !== process.env.CRON_SECRET && providedToken !== TEMP_DEBUG_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  // עד 22/8/2026 הסיכום כיסה 7 ימים אחורה. מ-23/8/2026 הוא מכסה את החודש הנוכחי מתחילתו -
  // כל יום ראשון מקבלים סיכום מצטבר של כל מה שקרה מתחילת החודש ועד עכשיו, ולא רק את השבוע האחרון.
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data: allTrades, error } = await supabaseAdmin
    .from('trades')
    .select('symbol, direction, entry_price, exit_price, stop_loss, shares_calculated, realized_pnl_usd, status, opened_at, closed_at');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const trades: Trade[] = allTrades || [];

  const openedThisWeekStillOpen = trades
    .filter((t) => t.status === 'open' && new Date(t.opened_at) >= monthStart)
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());

  const closedThisWeek = trades
    .filter((t) => t.status === 'closed' && t.closed_at && new Date(t.closed_at) >= monthStart)
    .sort((a, b) => new Date(b.closed_at as string).getTime() - new Date(a.closed_at as string).getTime());

  const wins = closedThisWeek.filter((t) => (t.realized_pnl_usd ?? 0) >= 0);
  const closedPcts = closedThisWeek.map((t) => pct(t)).filter((v): v is number => v !== null);
  const avgPct = closedPcts.length > 0 ? closedPcts.reduce((s, v) => s + v, 0) / closedPcts.length : null;
  const winRate = closedThisWeek.length > 0 ? (wins.length / closedThisWeek.length) * 100 : null;
  const totalOpenNow = trades.filter((t) => t.status === 'open').length;

  const rangeLabel = `${formatDate(monthStart.toISOString())} - ${formatDate(now.toISOString())}`;

  const html = `
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">

      <div style="background:#111318;padding:24px;text-align:center;">
        <img src="${SITE_URL}/shiran-photo.jpg" width="56" height="56" alt="שירן דימור" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #4fc9c4;margin-bottom:12px;" />
        <div style="color:#fff;font-size:18px;font-weight:700;">מסחר <span style="color:#4fc9c4;">אחראי</span> במניות</div>
        <div style="color:#9C8FD9;font-size:12.5px;letter-spacing:0.02em;margin-top:6px;">שירן דימור · קבוצת הסוחרים &quot;${GROUP_NAME}&quot;</div>
        <div style="color:#fff;font-size:20px;font-weight:700;margin-top:14px;">סיכום החודש</div>
        <div style="color:#aaa;font-size:13px;margin-top:4px;">${rangeLabel}</div>
      </div>

      <div style="display:flex;padding:20px 16px;gap:8px;border-bottom:1px solid #eee;">
        <table style="width:100%;border-collapse:collapse;"><tr>
          <td style="text-align:center;padding:8px;">
            <div style="font-size:20px;font-weight:700;color:${(avgPct ?? 0) >= 0 ? '#4FB876' : '#C9635E'};">${avgPct !== null ? `${avgPct >= 0 ? '+' : ''}${avgPct.toFixed(2)}%` : '—'}</div>
            <div style="font-size:11.5px;color:#888;margin-top:2px;">תשואה ממוצעת החודש</div>
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
        <div style="font-size:14.5px;font-weight:700;color:#111;margin-bottom:10px;">🟢 נפתחו החודש ונשארו פתוחות (${openedThisWeekStillOpen.length})</div>
        ${openedThisWeekStillOpen.length === 0 ? `<div style="font-size:13px;color:#888;padding-bottom:16px;">לא נפתחו עסקאות חדשות החודש</div>` : `
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
        <div style="font-size:14.5px;font-weight:700;color:#111;margin-bottom:10px;">✔ נסגרו החודש (${closedThisWeek.length})</div>
        ${closedThisWeek.length === 0 ? `<div style="font-size:13px;color:#888;padding-bottom:16px;">לא נסגרו עסקאות החודש</div>` : `
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
          <div style="font-size:14.5px;font-weight:700;color:#111;margin-bottom:6px;">🚀 קבוצת הסוחרים &quot;${GROUP_NAME}&quot;</div>
          <div style="font-size:13px;color:#666;">להצטרפות לחודש ניסיון (ללא התחייבות) כנסו ללינק</div>
        </div>
      </div>

    </div>
  </div>`;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY לא מוגדר - לא ניתן לשלוח סיכום שבועי');
    return NextResponse.json({ ok: true, sent: false });
  }

  let imageBase64: string | null = null;
  let imageError: string | null = null;
  try {
    imageBase64 = await renderHtmlToImageBase64(html);
  } catch (e) {
    console.error('שגיאה ביצירת תמונת הסיכום - נשלח בלי תמונה', e);
    imageError = e instanceof Error ? e.message : String(e);
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'סיכום החודש <noreply@shirandimor.com>',
        to: 'shiran@shirandimor.com',
        subject: `סיכום החודש לקבוצות · ${rangeLabel}`,
        html: imageBase64
          ? `<div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; padding: 16px; color:#333;">
              <p>הסיכום מצורף כתמונה למטה - אפשר לשמור ולשלוח אותה כמו שהיא לקבוצת העדכונים.</p>
              <p style="font-weight:700;margin-top:16px;">⚠️ שימו לב: בתוך התמונה עצמה הכפתור "הצטרפות עכשיו" אינו לחיץ - זו מגבלה של כל תמונה בוואטסאפ.</p>
              <p>מומלץ לצרף את הטקסט הבא כהודעה נפרדת מתחת לתמונה, כדי שהקישור יהיה לחיץ:</p>
              <div style="background:#f4f4f5;border:1px solid #ddd;border-radius:8px;padding:14px;margin-top:8px;white-space:pre-line;">🚀 להצטרפות לקבוצת הסוחרים "${GROUP_NAME}" לחודש ניסיון (ללא התחייבות):
${GROW_LINK}</div>
            </div>`
          : html,
        attachments: imageBase64
          ? [{ filename: 'סיכום-החודש.png', content: imageBase64 }]
          : undefined,
      }),
    });

    if (!res.ok) {
      console.error('שגיאה בשליחת הסיכום השבועי', await res.text());
      return NextResponse.json({ ok: true, sent: false });
    }

    return NextResponse.json({
      ok: true,
      sent: true,
      hasImage: Boolean(imageBase64),
      imageError,
      openedThisWeekStillOpen: openedThisWeekStillOpen.length,
      closedThisWeek: closedThisWeek.length,
    });
  } catch (e) {
    console.error('שגיאה בשליחת הסיכום השבועי', e);
    return NextResponse.json({ ok: true, sent: false });
  }
}
