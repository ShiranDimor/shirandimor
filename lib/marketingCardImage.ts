// רינדור כרטיס גרפי אוטומטי (PNG, 1080x1080) לפוסטים - אותו מנגנון headless Chrome שכבר
// משמש בהצלחה ב-lib/monthlySummary.ts (puppeteer-core + @sparticuz/chromium), רק עם עיצוב
// שונה. שני מצבים: 'trade' (סימבול+אחוז לעסקה שנסגרה) ו-'insight' (ציטוט/תובנה טקסטואלית).
//
// עיצוב "רגוע": רקע קרם חם (לא הרקע הכהה של האתר עצמו) עם שילוב של 2 צבעים מפלטת האתר
// בכל פעם, בגרסה מעומעמת/פסטלית (טקסט בגוון "דיו" כהה על רקע גוון בהיר) - לא ניאון רווי.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import os from 'os';
import path from 'path';
import fs from 'fs';

// @sparticuz/chromium מחלץ גופנים ל-tmp/fonts אבל לא תמיד קובע FONTCONFIG_PATH בעצמו (תלוי
// בזיהוי סביבת Amazon Linux 2023 שלא תמיד מתקיים ב-Vercel) - בלעדיו כרום מרנדר את כל הטקסט
// (כולל עברית) כריק לגמרי, בלי שגיאה גלויה. גם עם התיקון נצפה race נדיר בקולד-סטארט שבו
// החילוץ עדיין לא הושלם בפועל בדיסק כשכרום עולה - isFontsExtracted בודק את זה ישירות.
function isFontsExtracted(fontsDir: string): boolean {
  try {
    const openSansDir = path.join(fontsDir, 'fonts', 'Open_Sans');
    return fs.existsSync(openSansDir) && fs.readdirSync(openSansDir).length > 0;
  } catch {
    return false;
  }
}

async function waitForFontsExtracted(fontsDir: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if (isFontsExtracted(fontsDir)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function renderOnce(html: string): Promise<Buffer> {
  const executablePath = await chromium.executablePath();
  const fontsDir = path.join(os.tmpdir(), 'fonts');
  await waitForFontsExtracted(fontsDir);

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1080, height: 1080 },
    executablePath,
    headless: true,
    env: { ...process.env, FONTCONFIG_PATH: fontsDir, HOME: os.tmpdir() },
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    // חשוב: לא להעביר `clip` ל-screenshot - ב-chrome-headless-shell (הבינארי המצומצם של
    // @sparticuz/chromium) קליפ גורם לטקסט כולו להיעלם מהתמונה (הרקע/הצורות כן מצטלמים),
    // בלי שגיאה גלויה. ה-viewport כבר מוגדר בדיוק ל-1080x1080 אז screenshot רגיל שקול.
    return Buffer.from(await page.screenshot({ type: 'png' }));
  } finally {
    await browser.close();
  }
}

// בדיקת "ריקנות" גסה לפי גודל קובץ - כרטיס עם טקסט/גרפיקה תמיד יוצא כמה עשרות KB לפחות;
// רקע כמעט אחיד (הכרטיס נשאר ריק בגלל תקלת רינדור) דוחס ל-PNG הרבה יותר קטן. אם קרה למרות
// התיקון למעלה (race נדיר בקולד-סטארט) - עדיף ניסיון חוזר אחד מאשר לשמור כרטיס ריק בשקט.
const SUSPICIOUSLY_BLANK_BYTES = 8000;

async function renderHtmlToPngBase64(html: string): Promise<string> {
  let buffer = await renderOnce(html);
  if (buffer.length < SUSPICIOUSLY_BLANK_BYTES) {
    buffer = await renderOnce(html);
  }
  return buffer.toString('base64');
}

// פלטת האתר, בכל צבע: ink (גוון כהה ורווי של אותו צבע - לטקסט/קווים על רקע קרם בהיר) ו-tint
// (גרסה שקופה בהירה מאוד של אותו צבע - לרקע צ'יפים/תגיות, "רגוע" ולא ניאון). ירוק/אדום
// (תוצאת עסקה) מוגדרים בנפרד כי המשמעות שלהם קבועה ולא מתחלפת אקראית כמו האקסנטים.
type Hue = { ink: string; rgb: string };

const ACCENT_PALETTE: Hue[] = [
  { ink: '#2A8B86', rgb: '79,201,196' }, // teal
  { ink: '#6B5FAE', rgb: '156,143,217' }, // lavender
  { ink: '#B5791F', rgb: '232,163,61' }, // orange
  { ink: '#3178A8', rgb: '90,169,230' }, // sky
];

const GAIN: Hue = { ink: '#2E7D4F', rgb: '79,184,118' };
const LOSS: Hue = { ink: '#A2433D', rgb: '201,99,94' };

function pickAccent(): Hue {
  return ACCENT_PALETTE[Math.floor(Math.random() * ACCENT_PALETTE.length)];
}

function pickSecondAccent(exclude: Hue): Hue {
  const options = ACCENT_PALETTE.filter((h) => h.ink !== exclude.ink);
  return options[Math.floor(Math.random() * options.length)];
}

function tint(hue: Hue, alpha: number): string {
  return `rgba(${hue.rgb},${alpha})`;
}

const CREAM = '#F7F3EA';
const INK_DARK = '#20281F';
const INK_MUTED = '#6B6459';

function baseStyle(): string {
  return `
  @import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;600&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1080px; height: 1080px; overflow: hidden; }
  body { background: ${CREAM}; font-family: 'Rubik', sans-serif; position: relative; direction: rtl; }
`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export type TradeCardData = {
  symbol: string;
  directionLabel: string;
  durationLabel: string;
  pct: number;
  riskRewardLabel: string | null;
  hook: string;
};

export async function renderTradeCard(data: TradeCardData): Promise<string> {
  const result = data.pct >= 0 ? GAIN : LOSS;
  const accent = pickAccent(); // צבע משני מתוך פלטת האתר - משתנה בין כרטיס לכרטיס, לצד ירוק/אדום התוצאה
  const pctSign = data.pct >= 0 ? '+' : '';
  const chartPath = data.pct >= 0
    ? 'M0 130 L100 140 L200 108 L300 118 L400 82 L500 96 L600 48 L700 66 L800 24 L900 38'
    : 'M0 40 L100 30 L200 62 L300 50 L400 88 L500 74 L600 122 L700 104 L800 145 L900 130';

  const html = `<!DOCTYPE html><html lang="he"><head><meta charset="utf-8"><style>${baseStyle()}
    .wrap { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; padding: 70px; }
    .top-row { display: flex; justify-content: space-between; align-items: center; }
    .brand { color: ${INK_MUTED}; font-size: 22px; font-weight: 600; }
    .brand b { color: ${accent.ink}; font-weight: 700; }
    .divider-deco { width: 70px; height: 2px; background: ${accent.ink}; opacity: 0.4; }
    .hook { margin-top: 46px; color: ${INK_DARK}; font-size: 44px; font-weight: 800; line-height: 1.32; max-width: 900px; }
    .panel {
      margin-top: 44px; background: #FFFFFE; border-radius: 26px; padding: 40px 44px;
      box-shadow: 0 18px 40px rgba(32,40,31,0.08); position: relative; overflow: hidden;
    }
    .panel-top { display: flex; justify-content: space-between; align-items: flex-start; }
    .symbol { font-size: 46px; font-weight: 800; color: ${INK_DARK}; font-family: 'JetBrains Mono', monospace; letter-spacing: -1px; }
    .meta { margin-top: 4px; color: ${INK_MUTED}; font-size: 21px; font-weight: 500; }
    .badge { display: flex; align-items: center; gap: 6px; background: ${tint(result, 0.14)}; color: ${result.ink}; font-size: 18px; font-weight: 700; padding: 8px 18px; border-radius: 40px; white-space: nowrap; }
    .pct { margin-top: 26px; font-size: 96px; font-weight: 900; color: ${result.ink}; line-height: 1; direction: ltr; text-align: left; }
    .chart-line { position: absolute; left: 44px; right: 44px; bottom: 34px; opacity: 0.9; }
    .rr { margin-top: 10px; color: ${INK_MUTED}; font-size: 20px; font-weight: 500; }
    .rr b { color: ${INK_DARK}; font-family: 'JetBrains Mono', monospace; }
    .footer { margin-top: auto; display: flex; justify-content: space-between; align-items: center; }
    .footer .site { color: ${accent.ink}; font-size: 22px; font-weight: 600; }
  </style></head><body>
    <div class="wrap">
      <div class="top-row">
        <div class="brand">מסחר <b>אחראי</b> במניות</div>
        <div class="divider-deco"></div>
      </div>
      <div class="hook">${escapeHtml(data.hook)}</div>
      <div class="panel">
        <div class="panel-top">
          <div>
            <div class="symbol">${escapeHtml(data.symbol)}</div>
            <div class="meta">${escapeHtml(data.directionLabel)} · ${escapeHtml(data.durationLabel)}</div>
          </div>
          <div class="badge">${data.pct >= 0 ? '↗' : '·'} עסקה נסגרה</div>
        </div>
        <div class="pct">${pctSign}${data.pct.toFixed(1)}%</div>
        ${data.riskRewardLabel ? `<div class="rr">יחס סיכוי/סיכון: <b>${escapeHtml(data.riskRewardLabel)}</b></div>` : ''}
        <svg class="chart-line" width="900" height="150" viewBox="0 0 900 150" fill="none">
          <path d="${chartPath}" stroke="${result.ink}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.35"/>
        </svg>
      </div>
      <div class="footer"><div></div><div class="site">shirandimor.com ←</div></div>
    </div>
  </body></html>`;

  return renderHtmlToPngBase64(html);
}

// מפצל את ה-hook סביב highlightPhrase (אם באמת מופיע בו verbatim) כדי לעצב רק את החלק הזה
// באפקט "טוש מרקר" - שאר המשפט נשאר טקסט רגיל. אם אין התאמה מדויקת - כל המשפט רגיל, בלי קריסה.
const HEBREW_LETTER = /[א-ת]/;

function splitForHighlight(hook: string, highlightPhrase: string): { before: string; marked: string; after: string } | null {
  const trimmed = highlightPhrase.trim();
  if (!trimmed) return null;
  const idx = hook.indexOf(trimmed);
  if (idx === -1) return null;
  const endIdx = idx + trimmed.length;
  // אם התו ממש לפני/אחרי ההדגשה הוא אות עברית - ה-highlight חותך באמצע מילה (למשל אות
  // יחס דבוקה כמו ש-/ו-/ב- שנדבקת בלי רווח למילה שאחריה) - עדיף בלי הדגשה מאשר קטע שבור
  if (HEBREW_LETTER.test(hook[idx - 1] || '') || HEBREW_LETTER.test(hook[endIdx] || '')) return null;
  return { before: hook.slice(0, idx), marked: hook.slice(idx, endIdx), after: hook.slice(endIdx) };
}

export async function renderInsightCard(hook: string, highlightPhrase = ''): Promise<string> {
  const primary = pickAccent();
  const secondary = pickSecondAccent(primary);

  const split = splitForHighlight(hook, highlightPhrase);
  const hookHtml = split
    ? `${escapeHtml(split.before)}<span class="mark">${escapeHtml(split.marked)}</span>${escapeHtml(split.after)}`
    : escapeHtml(hook);

  const html = `<!DOCTYPE html><html lang="he"><head><meta charset="utf-8"><style>${baseStyle()}
    .brand { color: ${INK_MUTED}; font-size: 22px; font-weight: 600; }
    .brand b { color: ${primary.ink}; font-weight: 700; }
    .divider-deco { width: 70px; height: 2px; background: ${primary.ink}; opacity: 0.4; }
    .top-row { display: flex; justify-content: space-between; align-items: center; }
    .wrap { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 76px; }
    .hook { font-size: 68px; font-weight: 900; color: ${INK_DARK}; line-height: 1.32; letter-spacing: -0.5px; }
    .hook .mark {
      color: ${primary.ink}; background: ${tint(primary, 0.28)};
      padding: 2px 10px; border-radius: 6px; box-decoration-break: clone; -webkit-box-decoration-break: clone;
    }
    .footer { display: flex; justify-content: space-between; align-items: center; }
    .footer .site { color: ${secondary.ink}; font-size: 22px; font-weight: 600; }
  </style></head><body>
    <div class="wrap">
      <div class="top-row">
        <div class="brand">מסחר <b>אחראי</b> במניות</div>
        <div class="divider-deco"></div>
      </div>
      <div class="hook">${hookHtml}</div>
      <div class="footer"><div></div><div class="site">shirandimor.com ←</div></div>
    </div>
  </body></html>`;

  return renderHtmlToPngBase64(html);
}
