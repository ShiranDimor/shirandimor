// רינדור כרטיס גרפי אוטומטי (PNG, 1080x1080) לפוסטים - אותו מנגנון headless Chrome שכבר
// משמש בהצלחה ב-lib/monthlySummary.ts (puppeteer-core + @sparticuz/chromium), רק עם עיצוב
// שונה. שני מצבים: 'trade' (עסקה שנסגרה) ו-'insight' (ציטוט/תובנה טקסטואלית).
//
// עיצוב "רגוע": רקע קרם חם עם צורות אורגניות מטושטשות (מזכיר צילום צמחים/שיש בלי להזדקק
// לתמונה חיצונית אמיתית), פאנל זכוכית לבן לנתוני העסקה, וצבע דגש יחיד (לא שניים) מפלטת
// האתר בכל כרטיס - כדי שלא ייראה צבעוני מדי. ירוק/אדום לתוצאת עסקה (רווח/הפסד) הם המשמעות
// היחידה שלא מתחלפת אקראית - אלה סימנים אמיתיים, לא קישוט.
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

async function renderOnce(html: string, height = 1080): Promise<Buffer> {
  const executablePath = await chromium.executablePath();
  const fontsDir = path.join(os.tmpdir(), 'fonts');
  await waitForFontsExtracted(fontsDir);

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1080, height },
    executablePath,
    headless: true,
    env: { ...process.env, FONTCONFIG_PATH: fontsDir, HOME: os.tmpdir() },
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    // חשוב: לא להעביר `clip` ל-screenshot - ב-chrome-headless-shell (הבינארי המצומצם של
    // @sparticuz/chromium) קליפ גורם לטקסט כולו להיעלם מהתמונה (הרקע/הצורות כן מצטלמים),
    // בלי שגיאה גלויה. ה-viewport כבר מוגדר בדיוק לגובה הרצוי אז screenshot רגיל שקול.
    return Buffer.from(await page.screenshot({ type: 'png' }));
  } finally {
    await browser.close();
  }
}

// בדיקת "ריקנות" גסה לפי גודל קובץ - כרטיס עם טקסט/גרפיקה תמיד יוצא כמה עשרות KB לפחות;
// רקע כמעט אחיד (הכרטיס נשאר ריק בגלל תקלת רינדור) דוחס ל-PNG הרבה יותר קטן. אם קרה למרות
// התיקון למעלה (race נדיר בקולד-סטארט) - עדיף ניסיון חוזר אחד מאשר לשמור כרטיס ריק בשקט.
const SUSPICIOUSLY_BLANK_BYTES = 8000;

async function renderHtmlToPngBase64(html: string, height = 1080): Promise<string> {
  let buffer = await renderOnce(html, height);
  if (buffer.length < SUSPICIOUSLY_BLANK_BYTES) {
    buffer = await renderOnce(html, height);
  }
  return buffer.toString('base64');
}

// פלטת האתר: לכל צבע ink (גוון כהה ורווי - לטקסט/קווים על הרקע הבהיר) ו-rgb (לבניית rgba
// שקוף לרקעי צ'יפים/זוהר עדין). כרטיס מרוויח בוחר צבע דגש יחיד באקראי מתוך כל הפלטה (כולל
// ירוק) כדי שלא כל הכרטיסים ייראו זהים; כרטיס מפסיד נשאר תמיד אדום - זה סימן אמיתי לא קישוט.
type Hue = { ink: string; rgb: string };

const GAIN_PALETTE: Hue[] = [
  { ink: '#2E7D4F', rgb: '79,184,118' }, // ירוק (ברירת המחדל האינטואיטיבית לרווח)
  { ink: '#2A8B86', rgb: '79,201,196' }, // teal
  { ink: '#6B5FAE', rgb: '156,143,217' }, // lavender
  { ink: '#B5791F', rgb: '232,163,61' }, // orange
  { ink: '#3178A8', rgb: '90,169,230' }, // sky
];

const LOSS: Hue = { ink: '#A2433D', rgb: '201,99,94' };

function pickGainAccent(): Hue {
  return GAIN_PALETTE[Math.floor(Math.random() * GAIN_PALETTE.length)];
}

function tint(hue: Hue, alpha: number): string {
  return `rgba(${hue.rgb},${alpha})`;
}

function darken(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - factor)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - factor)));
  const b = Math.max(0, Math.round((n & 255) * (1 - factor)));
  return `rgb(${r},${g},${b})`;
}

// סדר קבוע לסבב הצבעים בתבנית הכרטיס המרוויח הקבועה (renderGainTradeCard) - לא אקראי,
// אלא מחזורי לפי בקשת שירן: ירוק, כתום, סגול, טורקיז, תכלת, וחוזר חלילה לירוק
const GAIN_CARD_CYCLE: Hue[] = [GAIN_PALETTE[0], GAIN_PALETTE[3], GAIN_PALETTE[2], GAIN_PALETTE[1], GAIN_PALETTE[4]];

function pickGainCardAccent(index: number): Hue {
  return GAIN_CARD_CYCLE[((index % GAIN_CARD_CYCLE.length) + GAIN_CARD_CYCLE.length) % GAIN_CARD_CYCLE.length];
}

const CREAM = '#F7F2E8';
const INK_DARK = '#1E2A22';
const INK_MUTED = '#6B6459';

// "צמחים/שיש" מטושטשים בלי תמונה אמיתית - בלובים אורגניים בגוון הדגש, מטושטשים חזק (blur),
// בפינות הכרטיס, פלוס שני "בלוקים" חמים בתחתית כתחליף לאבן/שיש בתמונת ההשראה
function organicBackdrop(accent: Hue): string {
  return `
    <div class="blob blob-tl"></div>
    <div class="blob blob-tr"></div>
    <div class="blob blob-br"></div>
    <div class="stone stone-l"></div>
    <div class="stone stone-r"></div>
    <style>
      .blob { position: absolute; border-radius: 50%; filter: blur(60px); opacity: 0.35; }
      .blob-tl { top: -120px; left: -100px; width: 380px; height: 380px; background: ${tint(accent, 0.55)}; }
      .blob-tr { top: -60px; right: -140px; width: 320px; height: 320px; background: ${tint(accent, 0.35)}; }
      .blob-br { bottom: -140px; right: 120px; width: 420px; height: 420px; background: ${tint(accent, 0.25)}; }
      .stone { position: absolute; bottom: -60px; width: 220px; height: 260px; border-radius: 22px; background: linear-gradient(160deg, #EFE7D8 0%, #E4D9C3 100%); opacity: 0.9; }
      .stone-l { left: -50px; transform: rotate(-4deg); }
      .stone-r { right: -50px; transform: rotate(5deg); }
    </style>
  `;
}

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

// אייקוני קו פשוטים ב-SVG במקום אימוג'ים - הבינארי המצומצם של @sparticuz/chromium לא כולל
// גופן אימוג'י (Noto Color Emoji וכו'), כך שאימוג'ים היו יוצאים כמלבנים ריקים בפרודקשן
function lineIcon(color: string, kind: 'chart' | 'shield' | 'target'): string {
  const common = `width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;
  if (kind === 'chart') {
    return `<svg ${common}><path d="M4 20V10"/><path d="M11 20V4"/><path d="M18 20v-7"/></svg>`;
  }
  if (kind === 'shield') {
    return `<svg ${common}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M9.5 12l1.8 1.8 3.2-3.6"/></svg>`;
  }
  return `<svg ${common}><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="0.6" fill="${color}"/></svg>`;
}

export type TradeCardData = {
  symbol: string;
  directionLabel: string;
  durationLabel: string;
  pct: number;
  riskRewardLabel: string | null;
  entryPrice: number | null;
  exitPrice: number | null;
  openedAt: string | null;
  closedAt: string | null;
};

// תאריך קצר בעברית (יום.חודש) לפי שעון ישראל - חייב אזור זמן מפורש כי זה רץ בשרת ב-UTC
function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', timeZone: 'Asia/Jerusalem' });
}

// כרטיס לעסקה מפסידה - עיצוב CSS דינמי (רגוע, בלובים אורגניים, אדום קבוע). לעסקה מרוויחה
// יש תבנית נפרדת (renderGainTradeCard) שמבוססת על תמונת רקע קבועה - ראה שם למה.
async function renderLossTradeCard(data: TradeCardData): Promise<string> {
  const isGain = false;
  const result = LOSS;
  const pctSign = '';
  // רוחב הפאנל בפועל (940 חוץ פחות 44*2 padding) = 852 - חייב להתאים בדיוק לרוחב ה-svg
  // וה-viewBox, אחרת נקודת הסיום (chart-end-dot) גולשת מחוץ לגבולות הפאנל
  const CHART_W = 852;
  const chartPath = isGain
    ? `M0 130 L95 140 L190 108 L285 118 L380 82 L475 96 L570 48 L665 66 L760 24 L${CHART_W} 14`
    : `M0 40 L95 30 L190 62 L285 50 L380 88 L475 74 L570 122 L665 104 L760 145 L${CHART_W} 152`;
  const endPoint = isGain ? { x: CHART_W, y: 14 } : { x: CHART_W, y: 152 };

  const stats = [
    ...(data.entryPrice !== null ? [{ label: 'מחיר כניסה', value: `$${data.entryPrice.toFixed(2)}` }] : []),
    ...(data.exitPrice !== null ? [{ label: 'מחיר יציאה', value: `$${data.exitPrice.toFixed(2)}` }] : []),
    { label: 'משך', value: data.durationLabel },
    ...(data.riskRewardLabel ? [{ label: 'סיכוי/סיכון', value: data.riskRewardLabel }] : []),
    { label: 'תוצאה', value: `${pctSign}${data.pct.toFixed(1)}%` },
  ];

  const html = `<!DOCTYPE html><html lang="he"><head><meta charset="utf-8"><style>${baseStyle()}
    .wrap { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; align-items: center; padding: 64px 70px; }
    .brand-row { display: flex; align-items: center; gap: 14px; }
    .brand-row .line { width: 44px; height: 1px; background: ${INK_MUTED}; opacity: 0.5; }
    .brand { color: ${INK_MUTED}; font-size: 22px; font-weight: 600; }
    .brand b { color: ${result.ink}; font-weight: 700; }
    .headline { margin-top: 34px; color: ${INK_DARK}; font-size: 96px; font-weight: 900; letter-spacing: -1px; }
    .panel {
      margin-top: 40px; width: 100%; background: rgba(255,255,255,0.82); border-radius: 30px; padding: 40px 44px;
      box-shadow: 0 24px 50px rgba(30,42,34,0.10); position: relative; overflow: hidden;
    }
    .panel-top { display: flex; justify-content: space-between; align-items: flex-start; }
    .symbol { font-size: 44px; font-weight: 800; color: ${INK_DARK}; font-family: 'JetBrains Mono', monospace; letter-spacing: -1px; }
    .badge { display: flex; align-items: center; gap: 8px; background: ${tint(result, 0.15)}; color: ${result.ink}; font-size: 19px; font-weight: 700; padding: 10px 20px; border-radius: 40px; white-space: nowrap; }
    .badge .dot { width: 22px; height: 22px; border-radius: 50%; background: ${result.ink}; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 13px; }
    .pct { margin-top: 22px; font-size: 92px; font-weight: 900; color: ${result.ink}; line-height: 1; direction: ltr; text-align: left; }
    .chart-wrap { position: relative; margin-top: 22px; }
    .chart-end-dot { position: absolute; width: 18px; height: 18px; border-radius: 50%; background: ${result.ink}; box-shadow: 0 0 0 6px ${tint(result, 0.22)}; }
    .stats-row { margin-top: 26px; display: flex; border-top: 1px solid rgba(30,42,34,0.08); padding-top: 22px; }
    .stat { flex: 1; text-align: center; border-right: 1px solid rgba(30,42,34,0.08); }
    .stat:first-child { border-right: none; }
    .stat .v { font-size: 25px; font-weight: 800; color: ${INK_DARK}; }
    .stat .l { margin-top: 3px; font-size: 15px; color: ${INK_MUTED}; }
    .icons-row { margin-top: 40px; display: flex; align-items: center; gap: 22px; }
    .icons-row .sep { width: 1px; height: 34px; background: rgba(30,42,34,0.15); }
    .icon-item { text-align: center; }
    .icon-item svg { display: block; margin: 0 auto; }
    .icon-item .t { margin-top: 6px; font-size: 17px; color: ${INK_MUTED}; font-weight: 500; }
    .footer { margin-top: auto; display: flex; align-items: center; gap: 14px; }
    .footer .line { width: 44px; height: 1px; background: ${INK_MUTED}; opacity: 0.5; }
    .footer .site { color: ${INK_DARK}; font-size: 22px; font-weight: 600; }
  </style></head><body>
    ${organicBackdrop(result)}
    <div class="wrap">
      <div class="brand-row"><div class="line"></div><div class="brand">מסחר <b>אחראי</b> במניות</div><div class="line"></div></div>
      <div class="headline">עסקה ${isGain ? 'סגורה' : 'נסגרה'}</div>
      <div class="panel">
        <div class="panel-top">
          <div class="symbol">${escapeHtml(data.symbol)}</div>
          <div class="badge"><div class="dot">${isGain ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l6 6L20 6"/></svg>' : ''}</div>עסקה סגורה</div>
        </div>
        <div class="pct">${pctSign}${data.pct.toFixed(1)}%</div>
        <div class="chart-wrap">
          <svg width="${CHART_W}" height="170" viewBox="0 0 ${CHART_W} 170" fill="none">
            <path d="${chartPath}" stroke="${result.ink}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
            <path d="${chartPath} L${CHART_W} 170 L0 170 Z" fill="url(#grad)" opacity="0.5"/>
            <defs><linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${result.ink}" stop-opacity="0.22"/>
              <stop offset="100%" stop-color="${result.ink}" stop-opacity="0"/>
            </linearGradient></defs>
          </svg>
          <div class="chart-end-dot" style="left: ${endPoint.x - 9}px; top: ${endPoint.y - 9}px;"></div>
        </div>
        <div class="stats-row">
          ${stats.map((s) => `<div class="stat"><div class="v">${escapeHtml(s.value)}</div><div class="l">${escapeHtml(s.label)}</div></div>`).join('')}
        </div>
      </div>
      <div class="icons-row">
        <div class="icon-item">${lineIcon(INK_MUTED, 'chart')}<div class="t">ניתוח מקצועי</div></div>
        <div class="sep"></div>
        <div class="icon-item">${lineIcon(INK_MUTED, 'shield')}<div class="t">ניהול סיכונים</div></div>
        <div class="sep"></div>
        <div class="icon-item">${lineIcon(INK_MUTED, 'target')}<div class="t">משמעת מסחר</div></div>
      </div>
      <div class="footer"><div class="line"></div><div class="site">shirandimor.com</div><div class="line"></div></div>
    </div>
  </body></html>`;

  return renderHtmlToPngBase64(html);
}

// תבנית קבועה לעסקה מרוויחה - רקע תמונה סטטית (במקום CSS דינמי) לפי בקשת המשתמשת: "אותה
// תמונה בדיוק כל פעם, רק מדביקים עליה את הנתונים המשתנים". התמונה כוללת "וי" ירוק וגרף עולה
// קבועים - משמעותית "הצלחה", ולכן משמשת אך ורק לעסקאות מרוויחות (להפסד יש תבנית CSS נפרדת
// למעלה, כדי לא להציג סימן הצלחה מטעה על עסקה שהפסידה). קואורדינטות הטקסט נמדדו ידנית
// מול הקובץ הזה - אם התמונה תוחלף, צריך למדוד מחדש.
let cachedBgBase64: string | null = null;
function getGainCardBackgroundBase64(): string {
  if (!cachedBgBase64) {
    const filePath = path.join(process.cwd(), 'public', 'marketing', 'trade-card-bg.jpg');
    cachedBgBase64 = fs.readFileSync(filePath).toString('base64');
  }
  return cachedBgBase64;
}

const GAIN_CARD_INK = '#12241C';
const GAIN_CARD_COVER = '#F9F6EE';

async function renderGainTradeCard(data: TradeCardData, accent: Hue): Promise<string> {
  const pctColor = accent.ink;
  const ctaColor = darken(accent.ink, 0.25);
  const metaLine = [data.riskRewardLabel ? `${data.riskRewardLabel} יחס סיכוי/סיכון` : '', data.durationLabel].filter(Boolean).join(' | ');
  const recapLine = [`+${data.pct.toFixed(1)}%`, data.riskRewardLabel, data.durationLabel, data.symbol].filter(Boolean).join(' | ');

  const priceStats = [
    ...(data.entryPrice !== null ? [{ label: 'מחיר כניסה', value: `$${data.entryPrice.toFixed(2)}` }] : []),
    ...(data.openedAt ? [{ label: 'תאריך כניסה', value: formatDateShort(data.openedAt) }] : []),
    ...(data.exitPrice !== null ? [{ label: 'מחיר יציאה', value: `$${data.exitPrice.toFixed(2)}` }] : []),
    ...(data.closedAt ? [{ label: 'תאריך יציאה', value: formatDateShort(data.closedAt) }] : []),
  ];

  const html = `<!DOCTYPE html><html lang="he"><head><meta charset="utf-8"><style>
    @import url('https://fonts.googleapis.com/css2?family=Rubik:wght@500;700;800;900&family=JetBrains+Mono:wght@700;800&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 1080px; height: 1330px; overflow: hidden; }
    body { background: url(data:image/jpeg;base64,${getGainCardBackgroundBase64()}) no-repeat top left; background-size: 1080px 1330px; font-family: 'Rubik', sans-serif; position: relative; direction: rtl; }
    .cover { position: absolute; background: ${GAIN_CARD_COVER}; }
    .symbol { position: absolute; top: 452px; left: 210px; width: 260px; height: 66px; font-size: 50px; font-weight: 800; color: ${GAIN_CARD_INK}; font-family: 'JetBrains Mono', monospace; letter-spacing: -1px; direction: ltr; text-align: left; display: flex; align-items: center; }
    .meta { position: absolute; top: 519px; left: 210px; width: 400px; height: 44px; font-size: 27px; font-weight: 500; color: ${GAIN_CARD_INK}; display: flex; align-items: center; }
    .pct { position: absolute; top: 585px; left: 210px; width: 420px; height: 108px; font-size: 84px; font-weight: 900; color: ${pctColor}; direction: ltr; text-align: left; display: flex; align-items: center; }
    .recap { position: absolute; top: 803px; left: 195px; width: 400px; height: 40px; font-size: 22px; font-weight: 500; color: ${GAIN_CARD_INK}; display: flex; align-items: center; }
    .site-url { position: absolute; top: 80px; left: 0; width: 1080px; text-align: center; font-size: 20px; font-weight: 500; color: #6B6459; direction: ltr; }
    .price-row { position: absolute; top: 862px; left: 170px; width: 740px; height: 70px; background: rgba(255,255,255,0.75); border-radius: 20px; display: flex; align-items: center; box-shadow: 0 10px 24px rgba(30,42,34,0.06); }
    .price-item { flex: 1; text-align: center; border-right: 1px solid rgba(18,36,28,0.1); }
    .price-item:first-child { border-right: none; }
    .price-item .v { font-size: 21px; font-weight: 800; color: ${GAIN_CARD_INK}; font-family: 'JetBrains Mono', monospace; }
    .price-item .l { margin-top: 3px; font-size: 13px; color: #6B6459; }
    .cta-cover { position: absolute; top: 1074px; left: 290px; width: 500px; height: 104px; background: ${ctaColor}; border-radius: 52px; }
    .cta-text { position: absolute; top: 1074px; left: 290px; width: 500px; height: 104px; display: flex; align-items: center; justify-content: center; gap: 10px; color: #fff; font-size: 27px; font-weight: 700; }
  </style></head><body>
    <div class="cover" style="top:450px; left:198px; width:264px; height:68px;"></div>
    <div class="cover" style="top:516px; left:198px; width:404px; height:48px;"></div>
    <div class="cover" style="top:582px; left:198px; width:424px; height:112px;"></div>
    <div class="cover" style="top:800px; left:193px; width:404px; height:44px;"></div>
    <div style="position:absolute; top:170px; left:10px; width:250px; height:250px; background: radial-gradient(ellipse at center, rgba(242,239,231,0.98) 50%, rgba(242,239,231,0) 78%);"></div>
    <div class="symbol">${escapeHtml(data.symbol)}</div>
    <div class="meta">${escapeHtml(metaLine)}</div>
    <div class="pct">+${data.pct.toFixed(1)}%</div>
    <div class="recap">${escapeHtml(recapLine)}</div>
    <div class="site-url">shirandimor.com</div>
    ${priceStats.length ? `<div class="price-row">${priceStats.map((s) => `<div class="price-item"><div class="v">${escapeHtml(s.value)}</div><div class="l">${escapeHtml(s.label)}</div></div>`).join('')}</div>` : ''}
    <div class="cta-cover"></div>
    <div class="cta-text"><span>7 ימי ניסיון ללא עלות</span></div>
  </body></html>`;

  return renderHtmlToPngBase64(html, 1330);
}

export async function renderTradeCard(data: TradeCardData, gainCardAccentIndex = 0): Promise<string> {
  return data.pct >= 0 ? renderGainTradeCard(data, pickGainCardAccent(gainCardAccentIndex)) : renderLossTradeCard(data);
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
  const accent = pickGainAccent();

  const split = splitForHighlight(hook, highlightPhrase);
  const hookHtml = split
    ? `${escapeHtml(split.before)}<span class="mark">${escapeHtml(split.marked)}</span>${escapeHtml(split.after)}`
    : escapeHtml(hook);

  const html = `<!DOCTYPE html><html lang="he"><head><meta charset="utf-8"><style>${baseStyle()}
    .brand { color: ${INK_MUTED}; font-size: 22px; font-weight: 600; }
    .brand b { color: ${accent.ink}; font-weight: 700; }
    .brand-row { display: flex; align-items: center; gap: 14px; }
    .brand-row .line { width: 44px; height: 1px; background: ${INK_MUTED}; opacity: 0.5; }
    .wrap { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 76px; }
    .hook { font-size: 68px; font-weight: 900; color: ${INK_DARK}; line-height: 1.32; letter-spacing: -0.5px; }
    .hook .mark {
      color: ${accent.ink}; background: ${tint(accent, 0.18)};
      padding: 2px 10px; border-radius: 6px; box-decoration-break: clone; -webkit-box-decoration-break: clone;
    }
    .footer { display: flex; align-items: center; gap: 14px; }
    .footer .line { width: 44px; height: 1px; background: ${INK_MUTED}; opacity: 0.5; }
    .footer .site { color: ${INK_DARK}; font-size: 22px; font-weight: 600; }
  </style></head><body>
    ${organicBackdrop(accent)}
    <div class="wrap">
      <div class="brand-row"><div class="line"></div><div class="brand">מסחר <b>אחראי</b> במניות</div><div class="line"></div></div>
      <div class="hook">${hookHtml}</div>
      <div class="footer"><div class="line"></div><div class="site">shirandimor.com</div><div class="line"></div></div>
    </div>
  </body></html>`;

  return renderHtmlToPngBase64(html);
}
