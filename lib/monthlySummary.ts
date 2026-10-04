import { createClient } from '@supabase/supabase-js';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import os from 'os';
import path from 'path';

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
  current_price: number | null;
};

const TRIAL_SIGNUP_URL = 'https://www.shirandimor.com/trial';
const GROUP_NAME = 'מדברים עסקאות';
const SITE_URL = 'https://www.shirandimor.com';

// לקבוצת העדכונים (חינמית) הסימבולים מטושטשים (כמו בכל האתר למי שאין לו/ה גישה מלאה) ואין
// צורך בהסרת משפט ה-7 ימי ניסיון - להפך, זה בדיוק קהל היעד שלו. לקבוצת הסוחרים (בתשלום) -
// הפוך: סימבולים גלויים (כמו שכבר היה) ובלי שום אזכור של הניסיון החינמי, כי הם כבר מנויים
export type SummaryAudience = 'updates' | 'traders';

// חובה timeZone מפורש - זה רץ בשרת (UTC), ובלי זה עסקה שנפתחה/נסגרה בשעות הקטנות של הלילה
// לפי שעון ישראל הייתה עלולה להיראות כאילו זה קרה יום קודם
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
}

// מרנדר את ה-HTML של הסיכום לתמונת PNG אמיתית (דרך כרום headless), כדי שאפשר יהיה לשמור ולשלוח אותה ישירות לקבוצות
async function renderHtmlToImageBase64(html: string): Promise<string> {
  const executablePath = await chromium.executablePath();
  // @sparticuz/chromium מחלץ גופנים ל-tmp/fonts אבל לא תמיד קובע FONTCONFIG_PATH בעצמו
  // (תלוי בזיהוי סביבת Amazon Linux 2023 שלא תמיד מתקיים ב-Vercel) - בלעדיו כרום מרנדר
  // את כל הטקסט (כולל עברית) כריק לגמרי, בלי שגיאה גלויה. חייבים להצביע לזה ידנית.
  const fontsDir = path.join(os.tmpdir(), 'fonts');

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 650, height: 800 },
    executablePath,
    headless: true,
    env: { ...process.env, FONTCONFIG_PATH: fontsDir, HOME: os.tmpdir() },
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

// רווח/הפסד לא ממומש לעסקה פתוחה, לפי המחיר הנוכחי (current_price) שמתעדכן ע"י כפתור
// "עדכון מחירים בכל האתר" - אותו חישוב בדיוק כמו pct(), רק מול המחיר הנוכחי במקום מחיר יציאה
function pctOpen(t: Trade) {
  if (t.current_price === null) return null;
  const dirFactor = t.direction === 'short' ? -1 : 1;
  return ((t.current_price - t.entry_price) / t.entry_price) * 100 * dirFactor;
}

// blurSymbol - בדיוק כמו .trade-symbol.blurred באתר עצמו (filter: blur), רק inline כי זה
// נרנדר לתמונת PNG קבועה דרך כרום headless ולא תלוי בתמיכת CSS של לקוח מייל
function symbolCellHtml(symbol: string, blurSymbol: boolean) {
  if (!blurSymbol) return symbol;
  return `<span style="filter:blur(5px);user-select:none;color:#999;">${symbol}</span>`;
}

function tradeRowHtml(t: Trade, kind: 'open' | 'closed', blurSymbol: boolean) {
  const dirLabel = t.direction === 'long' ? 'לונג' : 'שורט';
  const dirColor = t.direction === 'long' ? '#4FB876' : '#C9635E';
  const symbolCell = symbolCellHtml(t.symbol, blurSymbol);

  if (kind === 'open') {
    const p = pctOpen(t);
    const resultColor = (p ?? 0) >= 0 ? '#4FB876' : '#C9635E';
    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:700;">${symbolCell}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;color:${dirColor};font-weight:600;">${dirLabel}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;">$${t.entry_price}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;">$${t.stop_loss}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;color:${resultColor};font-weight:700;">
          ${p !== null ? `${p >= 0 ? '+' : ''}${p.toFixed(2)}%` : '—'}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#888;font-size:13px;">${formatDate(t.opened_at)}</td>
      </tr>`;
  }

  const p = pct(t);
  const resultColor = (p ?? 0) >= 0 ? '#4FB876' : '#C9635E';
  return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:700;">${symbolCell}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;color:${dirColor};font-weight:600;">${dirLabel}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;">$${t.entry_price} ← $${t.exit_price}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;color:${resultColor};font-weight:700;">
        ${p !== null ? `${p >= 0 ? '+' : ''}${p.toFixed(2)}%` : '—'}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#888;font-size:13px;">${formatDate(t.closed_at as string)}</td>
    </tr>`;
}

// targetMonth אופציונלי (month 0-אינדקס, כמו ב-Date רגיל) - לשליחה ידנית של חודש שעבר (למשל
// 1 באוקטובר רוצים את סיכום ספטמבר), בלי זה ברירת המחדל היא החודש הנוכחי עד הרגע הזה ממש.
// audience ברירת המחדל 'traders' - שומר על ההתנהגות הקודמת (סימבולים גלויים) למי שקורא לפונקציה בלי לציין
async function buildSummaryHtml(targetMonth?: { year: number; month: number }, audience: SummaryAudience = 'traders') {
  const blurSymbols = audience === 'updates';
  const now = new Date();
  // מחושב לפי שעון ישראל ולא UTC (זמן השרת) - כדי שתחילת החודש תתאים לחצות האמיתית בישראל
  const nowIsrael = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const year = targetMonth?.year ?? nowIsrael.getFullYear();
  const month = targetMonth?.month ?? nowIsrael.getMonth();
  const isCurrentMonth = year === nowIsrael.getFullYear() && month === nowIsrael.getMonth();

  const monthStart = new Date(year, month, 1);
  // גבול עליון לסינון (לא לתצוגה) - תחילת החודש הבא, לא "23:59:59 של היום האחרון": זמן כזה
  // ממש בסוף היום, אחרי שעובר דרך formatDate (שממיר לשעון ישראל, UTC+2/3), עלול "להידחף" כבר
  // ליום הראשון של החודש הבא בתצוגה. גם לסינון עצמו "<" מול תחילת החודש הבא מדויק יותר מ-"<="
  // מול רגע מסוים בתוך היום האחרון, כי הוא תמיד כולל את כל היום האחרון במלואו
  const nextMonthStart = new Date(year, month + 1, 1);
  const filterEnd = isCurrentMonth ? nowIsrael : nextMonthStart;
  // חודש שעבר (לא הנוכחי) - לתצוגה בלבד: היום האחרון של החודש בחצות (00:00), לא "עכשיו"
  const displayEnd = isCurrentMonth ? nowIsrael : new Date(year, month + 1, 0);

  const { data: allTrades, error } = await supabaseAdmin
    .from('trades')
    .select('symbol, direction, entry_price, exit_price, stop_loss, shares_calculated, realized_pnl_usd, status, opened_at, closed_at, current_price');

  if (error) throw new Error(error.message);

  const trades: Trade[] = allTrades || [];

  // כל העסקאות הפתוחות כרגע (לא רק אלו שנפתחו החודש) - כדי שהסיכום ישקף את מצב התיק האמיתי,
  // כולל עסקאות שנפתחו בחודש קודם ועדיין פתוחות
  const openedThisWeekStillOpen = trades
    .filter((t) => t.status === 'open')
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());

  const closedThisWeek = trades
    .filter((t) => t.status === 'closed' && t.closed_at && new Date(t.closed_at) >= monthStart && new Date(t.closed_at) < filterEnd)
    .sort((a, b) => new Date(b.closed_at as string).getTime() - new Date(a.closed_at as string).getTime());

  const wins = closedThisWeek.filter((t) => (t.realized_pnl_usd ?? 0) >= 0);
  const closedPcts = closedThisWeek.map((t) => pct(t)).filter((v): v is number => v !== null);
  const avgPct = closedPcts.length > 0 ? closedPcts.reduce((s, v) => s + v, 0) / closedPcts.length : null;
  const winRate = closedThisWeek.length > 0 ? (wins.length / closedThisWeek.length) * 100 : null;
  const totalOpenNow = trades.filter((t) => t.status === 'open').length;

  const rangeLabel = `${formatDate(monthStart.toISOString())} - ${formatDate(displayEnd.toISOString())}`;

  const html = `
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">

      <div style="background:#111318;padding:24px;text-align:center;">
        <img src="${SITE_URL}/shiran-photo.jpg" width="56" height="56" alt="שירן דימור" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #4fc9c4;margin-bottom:12px;" />
        <div style="color:#fff;font-size:18px;font-weight:700;">מסחר <span style="color:#4fc9c4;">אחראי</span> במניות</div>
        <div style="color:#9C8FD9;font-size:12.5px;letter-spacing:0.02em;margin-top:6px;">שירן דימור · ${audience === 'traders' ? `קבוצת הסוחרים &quot;${GROUP_NAME}&quot;` : 'קבוצת העדכונים'}</div>
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
        <div style="font-size:14.5px;font-weight:700;color:#111;margin-bottom:10px;">🟢 עסקאות פתוחות כרגע (${openedThisWeekStillOpen.length})</div>
        ${openedThisWeekStillOpen.length === 0 ? `<div style="font-size:13px;color:#888;padding-bottom:16px;">אין עסקאות פתוחות כרגע</div>` : `
        <table style="width:100%;border-collapse:collapse;font-size:13.5px;">
          <tr style="color:#888;font-size:11.5px;text-align:right;">
            <th style="padding:0 12px 6px;text-align:right;">סימבול</th>
            <th style="padding:0 12px 6px;text-align:right;">כיוון</th>
            <th style="padding:0 12px 6px;text-align:right;">כניסה</th>
            <th style="padding:0 12px 6px;text-align:right;">סטופ</th>
            <th style="padding:0 12px 6px;text-align:right;">רווח/הפסד</th>
            <th style="padding:0 12px 6px;text-align:right;">תאריך</th>
          </tr>
          ${openedThisWeekStillOpen.map((t) => tradeRowHtml(t, 'open', blurSymbols)).join('')}
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
          ${closedThisWeek.map((t) => tradeRowHtml(t, 'closed', blurSymbols)).join('')}
        </table>`}
      </div>

      ${audience === 'updates' ? `
      <div style="padding:6px 16px 24px;text-align:center;">
        <div style="background:#f0faf9;border:1px solid #cdeeeb;border-radius:12px;padding:18px 16px;">
          <div style="font-size:14.5px;font-weight:700;color:#111;margin-bottom:6px;">🚀 קבוצת הסוחרים &quot;${GROUP_NAME}&quot;</div>
          <div style="font-size:13px;color:#666;">להצטרפות ל-7 ימי ניסיון ללא עלות כנסו ללינק</div>
        </div>
      </div>` : `
      <div style="padding:6px 16px 24px;text-align:center;">
        <div style="background:#f4f4f5;border:1px solid #e5e5e5;border-radius:12px;padding:16px;text-align:right;">
          <div style="font-size:13px;color:#555;margin-bottom:10px;">חברים, שימו לב למצב התיק (תמיד אפשר להיכנס גם לתיק המלא באתר) - בעיקר לעסקאות הפתוחות.</div>
          <div style="font-size:13px;color:#555;margin-bottom:10px;">כל עוד המחיר עוד לא עבר את המחיר המקסימלי לכניסה (יש עמודה ייעודית לזה בתיק הפתוחות באתר) - עדיין אפשר להיכנס לעסקה.</div>
          <div style="font-size:13px;color:#555;margin-bottom:10px;">זה בדיוק היתרון בעסקאות סווינג: לא צריך להיות מחוברים 24/7 לנייד, ואם נכנסתם אחרי שעה, שעתיים, יום או יומיים - זה בסדר גמור, כל עוד המחיר המקסימלי לא נחצה.</div>
          <div style="font-size:13px;color:#555;text-align:center;">יום שקט לכולנו 🙏</div>
        </div>
      </div>`}

    </div>
  </div>`;

  return { html, rangeLabel, openedThisWeekStillOpen, closedThisWeek, avgPct, winRate, totalOpenNow, audience };
}

// טקסט "מפוצץ" לשליחה ידנית בוואטסאפ (לצד התמונה) - עם אימוג'ים ופירוט מלא של כל עסקה,
// כדי שאפשר יהיה להדביק אותו כטקסט חופשי בלי תלות ביכולת שליחת תמונות אוטומטית
function buildWhatsappSummaryText(data: Awaited<ReturnType<typeof buildSummaryHtml>>) {
  const { rangeLabel, openedThisWeekStillOpen, closedThisWeek, avgPct, winRate, totalOpenNow, audience } = data;

  const lines: string[] = [];
  lines.push(audience === 'traders' ? `🚀 *סיכום החודש - קבוצת הסוחרים "${GROUP_NAME}"*` : `🚀 *סיכום החודש - קבוצת העדכונים*`);
  lines.push(`📅 ${rangeLabel}`);
  lines.push('');
  lines.push(`💰 תשואה ממוצעת החודש: ${avgPct !== null ? `${avgPct >= 0 ? '+' : ''}${avgPct.toFixed(2)}%` : '—'}`);
  lines.push(`✅ אחוז הצלחה: ${winRate !== null ? winRate.toFixed(0) + '%' : '—'}`);
  lines.push(`🔒 עסקאות שנסגרו החודש: ${closedThisWeek.length}`);
  lines.push(`📈 עסקאות פתוחות כרגע: ${totalOpenNow}`);
  lines.push('');

  // לקבוצת העדכונים לא מפרטים עסקה-עסקה בטקסט (הם רואים את הטבלה המטושטשת בתמונה עצמה) -
  // רק סטטיסטיקת הסיכום למעלה ואז קריאה לפעולה. לקבוצת הסוחרים הפירוט המלא נשאר כמו תמיד
  if (audience === 'traders') {
    if (openedThisWeekStillOpen.length > 0) {
      lines.push('*עסקאות פתוחות כרגע:*');
      for (const t of openedThisWeekStillOpen) {
        const p = pctOpen(t);
        const dirLabel = t.direction === 'long' ? 'לונג' : 'שורט';
        const emoji = (p ?? 0) >= 0 ? '🟢' : '🔴';
        lines.push(`${emoji} ${t.symbol} (${dirLabel}) | כניסה ${formatDate(t.opened_at)} ב-$${t.entry_price} | כרגע ${p !== null ? `${p >= 0 ? '+' : ''}${p.toFixed(2)}%` : '—'}`);
      }
      lines.push('');
    }

    if (closedThisWeek.length > 0) {
      lines.push('*עסקאות שנסגרו החודש:*');
      for (const t of closedThisWeek) {
        const p = pct(t);
        const dirLabel = t.direction === 'long' ? 'לונג' : 'שורט';
        const emoji = (p ?? 0) >= 0 ? '🎯' : '⚠️';
        lines.push(`${emoji} ${t.symbol} (${dirLabel}) | כניסה ${formatDate(t.opened_at)} | $${t.entry_price} ← $${t.exit_price} | ${p !== null ? `${p >= 0 ? '+' : ''}${p.toFixed(2)}%` : '—'} | נסגרה ${formatDate(t.closed_at as string)}`);
      }
      lines.push('');
    }

    lines.push('חברים, שימו לב למצב התיק (תמיד אפשר להיכנס גם לתיק המלא באתר) - בעיקר לעסקאות הפתוחות.');
    lines.push('');
    lines.push('כל עוד המחיר עוד לא עבר את המחיר המקסימלי לכניסה (יש עמודה ייעודית לזה בתיק הפתוחות באתר) - עדיין אפשר להיכנס לעסקה.');
    lines.push('');
    lines.push('זה בדיוק היתרון בעסקאות סווינג: לא צריך להיות מחוברים 24/7 לנייד, ואם נכנסתם אחרי שעה, שעתיים, יום או יומיים - זה בסדר גמור, כל עוד המחיר המקסימלי לא נחצה.');
    lines.push('');
    lines.push('יום שקט לכולנו 🙏');
  } else {
    lines.push('רוצים לראות מה קרה השבוע האחרון בקבוצת הסוחרים? בשקט, בלי רעש וצלצולים, ובלי אלפי שקלים לקורס תיאורטי - 7 ימי ניסיון ללא עלות:');
    lines.push(TRIAL_SIGNUP_URL);
  }

  return lines.join('\n');
}

export async function getMonthlySummaryImage(targetMonth?: { year: number; month: number }, audience: SummaryAudience = 'traders') {
  const { html, rangeLabel } = await buildSummaryHtml(targetMonth, audience);
  const imageBase64 = await renderHtmlToImageBase64(html);
  return { imageBase64, rangeLabel };
}

// שולח את סיכום החודש למייל של שירן - בין אם דרך ה-cron האוטומטי (יום ראשון) ובין אם בלחיצת
// כפתור ידנית מעמוד הניהול. תמיד שולח למייל הקבוע shiran@shirandimor.com (לא לכתובת שרירותית),
// כדי שאי אפשר יהיה להשתמש בזה כדי לשלוח מייל למישהו אחר.
// targetMonth אופציונלי - לשליחה ידנית של חודש שעבר (למשל ביקשה ב-1.10 את סיכום ספטמבר).
// audience - 'traders' (ברירת מחדל, תואם להתנהגות הקודמת) שולח לקבוצת הסוחרים עם סימבולים גלויים
// ובלי אזכור ניסיון חינמי, 'updates' שולח לקבוצת העדכונים עם סימבולים מטושטשים וכפתור ניסיון
export async function sendMonthlySummaryEmail(targetMonth?: { year: number; month: number }, audience: SummaryAudience = 'traders') {
  const summaryData = await buildSummaryHtml(targetMonth, audience);
  const { html, rangeLabel, openedThisWeekStillOpen, closedThisWeek } = summaryData;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY לא מוגדר - לא ניתן לשלוח סיכום');
  }

  let imageBase64: string | null = null;
  let imageError: string | null = null;
  try {
    imageBase64 = await renderHtmlToImageBase64(html);
  } catch (e) {
    console.error('שגיאה ביצירת תמונת הסיכום - נשלח בלי תמונה', e);
    imageError = e instanceof Error ? e.message : String(e);
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: 'סיכום החודש <noreply@shirandimor.com>',
      to: 'shiran@shirandimor.com',
      subject: `סיכום החודש ל${audience === 'traders' ? 'קבוצת הסוחרים' : 'קבוצת העדכונים'} · ${rangeLabel}`,
      html: imageBase64
        ? `<div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; padding: 16px; color:#333;">
            <p>הסיכום מצורף כתמונה למטה - אפשר לשמור ולשלוח אותה כמו שהיא ל${audience === 'traders' ? 'קבוצת הסוחרים' : 'קבוצת העדכונים'}.</p>
            ${audience === 'updates' ? `
            <p style="font-weight:700;margin-top:16px;">⚠️ שימו לב: בתוך התמונה עצמה הכפתור "הצטרפות עכשיו" אינו לחיץ - זו מגבלה של כל תמונה בוואטסאפ.</p>
            <p>מומלץ לצרף את הטקסט הבא כהודעה נפרדת מתחת לתמונה, כדי שהקישור יהיה לחיץ:</p>
            <div style="background:#f4f4f5;border:1px solid #ddd;border-radius:8px;padding:14px;margin-top:8px;white-space:pre-line;">🚀 להצטרפות לקבוצת הסוחרים "${GROUP_NAME}" ל-7 ימי ניסיון ללא עלות:
${TRIAL_SIGNUP_URL}</div>` : ''}
          </div>`
        : html,
      attachments: imageBase64
        ? [{ filename: 'סיכום-החודש.png', content: imageBase64 }]
        : undefined,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`שגיאה בשליחת הסיכום דרך Resend: ${errText}`);
  }

  return {
    sent: true,
    hasImage: Boolean(imageBase64),
    imageError,
    openedThisWeekStillOpen: openedThisWeekStillOpen.length,
    closedThisWeek: closedThisWeek.length,
    imageBase64,
    whatsappText: buildWhatsappSummaryText(summaryData),
  };
}
