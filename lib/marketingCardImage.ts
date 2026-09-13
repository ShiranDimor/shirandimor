// רינדור כרטיס גרפי אוטומטי (PNG, 1080x1080) לפוסטים - אותו מנגנון headless Chrome שכבר
// משמש בהצלחה ב-lib/monthlySummary.ts (puppeteer-core + @sparticuz/chromium), רק עם עיצוב
// שונה. שני מצבים: 'trade' (סימבול+אחוז לעסקה שנסגרה) ו-'insight' (ציטוט/תובנה טקסטואלית).
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

// גוונים "משניים" מתוך פלטת האתר (מלבד ירוק/אדום שנשמרים לתוצאת עסקה) - כל כרטיס מגריל
// אחד מהם לשילוב עם הצבע הראשי שלו, כדי שהכרטיסים לא ייראו כולם זהים אבל עדיין תואמים לאתר
const ACCENT_PALETTE = [
  { hex: '#4FC9C4', rgb: '79,201,196' }, // teal
  { hex: '#9C8FD9', rgb: '156,143,217' }, // lavender
  { hex: '#E8A33D', rgb: '232,163,61' }, // orange
  { hex: '#5AA9E6', rgb: '90,169,230' }, // sky
];

function pickAccent(): { hex: string; rgb: string } {
  return ACCENT_PALETTE[Math.floor(Math.random() * ACCENT_PALETTE.length)];
}

function baseStyle(glow1: { hex: string; rgb: string }, glow2: { hex: string; rgb: string }): string {
  return `
  @import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;600&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1080px; height: 1080px; overflow: hidden; }
  body { background: #080B12; font-family: 'Rubik', sans-serif; position: relative; direction: rtl; }
  .bg-glow-1 { position: absolute; top: -280px; right: -220px; width: 800px; height: 800px; background: radial-gradient(circle, rgba(${glow1.rgb},0.22) 0%, rgba(${glow1.rgb},0) 68%); }
  .bg-glow-2 { position: absolute; bottom: -300px; left: -260px; width: 700px; height: 700px; background: radial-gradient(circle, rgba(${glow2.rgb},0.14) 0%, rgba(${glow2.rgb},0) 70%); }
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
  const pctColor = data.pct >= 0 ? '#4FB876' : '#C9635E';
  const pctRgb = data.pct >= 0 ? '79,184,118' : '201,99,94';
  const pctSign = data.pct >= 0 ? '+' : '';
  const accent = pickAccent(); // צבע משני מתוך פלטת האתר - משתנה בין כרטיס לכרטיס, לצד הירוק/אדום הקבוע של התוצאה
  const chartPath = data.pct >= 0
    ? 'M0 190 L120 205 L240 160 L360 175 L480 120 L600 140 L720 70 L840 95 L960 35 L1080 55'
    : 'M0 60 L120 45 L240 90 L360 75 L480 130 L600 110 L720 180 L840 155 L960 215 L1080 195';

  const html = `<!DOCTYPE html><html lang="he"><head><meta charset="utf-8"><style>${baseStyle({ hex: pctColor, rgb: pctRgb }, accent)}
    .badge { display: flex; align-items: center; gap: 8px; background: ${data.pct >= 0 ? 'rgba(79,184,118,0.12)' : 'rgba(201,99,94,0.12)'}; border: 1.5px solid ${pctColor}; color: ${pctColor}; font-size: 20px; font-weight: 700; padding: 9px 20px; border-radius: 40px; }
    .top-row { display: flex; justify-content: space-between; align-items: center; }
    .brand { color: #8E96A8; font-size: 22px; font-weight: 600; }
    .brand b { color: ${accent.hex}; font-weight: 700; }
    .hook { margin-top: 56px; color: #E9ECF2; font-size: 40px; font-weight: 700; line-height: 1.35; max-width: 880px; }
    .stat-block { margin-top: auto; display: flex; align-items: flex-end; justify-content: space-between; }
    .symbol-col .symbol { font-size: 64px; font-weight: 800; color: #E9ECF2; font-family: 'JetBrains Mono', monospace; letter-spacing: -1px; }
    .symbol-col .meta { margin-top: 6px; color: #8E96A8; font-size: 24px; font-weight: 500; }
    .pct-col { text-align: left; direction: ltr; }
    .pct-col .pct { font-size: 128px; font-weight: 900; color: ${pctColor}; line-height: 1; }
    .pct-col .rr { margin-top: 4px; color: #8E96A8; font-size: 22px; font-weight: 500; text-align: right; direction: rtl; }
    .rr b { color: #E9ECF2; font-family: 'JetBrains Mono', monospace; }
    .divider { height: 1px; background: #232B3D; margin: 40px 0 28px; }
    .footer { display: flex; justify-content: space-between; align-items: center; }
    .footer .site { color: ${accent.hex}; font-size: 22px; font-weight: 600; }
    .wrap { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; padding: 64px 64px 56px; }
    .chart-line { position: absolute; left: 0; right: 0; bottom: 240px; opacity: 0.9; }
  </style></head><body>
    <div class="bg-glow-1"></div><div class="bg-glow-2"></div>
    <svg class="chart-line" width="1080" height="260" viewBox="0 0 1080 260" fill="none">
      <path d="${chartPath}" stroke="${pctColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>
      <path d="${chartPath} L1080 260 L0 260 Z" fill="url(#grad)" opacity="0.5"/>
      <defs><linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${pctColor}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="${pctColor}" stop-opacity="0"/>
      </linearGradient></defs>
    </svg>
    <div class="wrap">
      <div class="top-row">
        <div class="brand">מסחר <b>אחראי</b> במניות</div>
        <div class="badge">${data.pct >= 0 ? '✓' : '·'} עסקה נסגרה</div>
      </div>
      <div class="hook">${escapeHtml(data.hook)}</div>
      <div class="stat-block">
        <div class="symbol-col">
          <div class="symbol">${escapeHtml(data.symbol)}</div>
          <div class="meta">${escapeHtml(data.directionLabel)} · ${escapeHtml(data.durationLabel)}</div>
        </div>
        <div class="pct-col">
          <div class="pct">${pctSign}${data.pct.toFixed(1)}%</div>
          ${data.riskRewardLabel ? `<div class="rr">יחס סיכוי/סיכון: <b>${escapeHtml(data.riskRewardLabel)}</b></div>` : ''}
        </div>
      </div>
      <div class="divider"></div>
      <div class="footer"><div></div><div class="site">shirandimor.com ←</div></div>
    </div>
  </body></html>`;

  return renderHtmlToPngBase64(html);
}

export async function renderInsightCard(hook: string): Promise<string> {
  const primary = pickAccent();
  let secondary = pickAccent();
  if (secondary.hex === primary.hex) {
    secondary = ACCENT_PALETTE[(ACCENT_PALETTE.indexOf(primary) + 1) % ACCENT_PALETTE.length];
  }
  const primaryRgba = `rgba(${primary.rgb},0.12)`;

  const html = `<!DOCTYPE html><html lang="he"><head><meta charset="utf-8"><style>${baseStyle(primary, secondary)}
    .badge { display: inline-flex; align-items: center; gap: 8px; background: ${primaryRgba}; border: 1.5px solid ${primary.hex}; color: ${primary.hex}; font-size: 20px; font-weight: 700; padding: 9px 20px; border-radius: 40px; }
    .brand { color: #8E96A8; font-size: 22px; font-weight: 600; }
    .brand b { color: ${primary.hex}; font-weight: 700; }
    .wrap { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 70px; }
    .hook { font-size: 54px; font-weight: 800; color: #E9ECF2; line-height: 1.45; }
    .qmark { font-family: 'Rubik', sans-serif; font-size: 100px; font-weight: 800; color: ${secondary.hex}; opacity: 0.6; line-height: 0.6; margin-top: 26px; margin-bottom: 6px; }
    .footer { display: flex; justify-content: space-between; align-items: center; }
    .footer .site { color: ${primary.hex}; font-size: 22px; font-weight: 600; }
  </style></head><body>
    <div class="bg-glow-1"></div><div class="bg-glow-2"></div>
    <div class="wrap">
      <div class="brand">מסחר <b>אחראי</b> במניות</div>
      <div>
        <div class="badge">תוכן מקצועי</div>
        <div class="qmark">"</div>
        <div class="hook">${escapeHtml(hook)}</div>
      </div>
      <div class="footer"><div></div><div class="site">shirandimor.com ←</div></div>
    </div>
  </body></html>`;

  return renderHtmlToPngBase64(html);
}
