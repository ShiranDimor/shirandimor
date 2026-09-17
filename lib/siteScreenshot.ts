// צילום מסך אמיתי של עמוד באתר שירן עצמו (shirandimor.com) - לשימוש בסטורי "מהאתר" (למשל
// אזור שיווקי ספציפי שהיא כבר עיצבה באתר, בלי לבנות תבנית גרפית נפרדת בקוד). מוגבל במפורש
// לדומיין של האתר בלבד (לא כלי צילום-מסך כללי לכל URL) - זה כלי אדמין פנימי, לא צריך יותר מזה.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import type { Browser, ElementHandle } from 'puppeteer-core';
import os from 'os';
import path from 'path';
import fs from 'fs';

const ALLOWED_HOSTS = ['shirandimor.com', 'www.shirandimor.com'];
const VIEWPORT_WIDTH = 430;
const MAX_FALLBACK_HEIGHT = 1500;
// כפתורי צ'אט צפים (וואטסאפ/דור) מוצגים בכל עמוד בלי קשר לגלילה - לא רלוונטיים לצילום
// שיווקי של אזור ספציפי באתר, אז מוסתרים לפני הצילום (רק בעמוד המצולם עצמו, לא באתר בפועל).
// [data-story-hide] הוא סימון כללי בקוד האתר לאלמנטים שאסור שיופיעו בסטורי (בעיקר סכומי כסף
// בדולרים, למשל בעמוד התיק) - שירן ביקשה שזה יימחק תמיד, בלי קשר לעמוד הספציפי.
const HIDE_SELECTORS = '.wa-float-btn, .dor-float-btn, .dor-callout, [data-story-hide]';
// אין דרך API להוסיף לינק לחיץ אמיתי לסטורי (Facebook Page Stories לא תומך בזה) - במקום
// זה, אם יש כפתור קריאה-לפעולה באזור שצולם, מסמנים אותו ויזואלית עם עיגול+חץ סגול, בדיוק
// כמו שירן הייתה עושה ידנית כדי להפנות תשומת לב אליו (הלינק עצמו נכתב אצלה בדרך אחרת)
const CTA_SELECTOR = '.btn-primary, .cta-main, a.btn-primary, button.btn-primary';
const HIGHLIGHT_COLOR = '#9C8FD9';

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

function assertAllowedUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('כתובת URL לא תקינה');
  }
  if (!ALLOWED_HOSTS.includes(url.hostname)) {
    throw new Error('אפשר לצלם רק עמודים מתוך shirandimor.com');
  }
  return url;
}

// חץ עקום פשוט ב-SVG (לא אימוג'י - הבינארי המצומצם לא כולל גופן אימוג'י) שמצביע כלפי מעלה
// וימינה, לכיוון העיגול שמסביב לכפתור
function upRightArrowSvg(color: string): string {
  return `<svg width="90" height="100" viewBox="0 0 90 100" fill="none">
    <path d="M10 90 C 25 65, 15 40, 50 18" stroke="${color}" stroke-width="5" stroke-linecap="round" fill="none"/>
    <path d="M32 12 L54 16 L48 38" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`;
}

// מרכיב עיגול (border רחב + border-radius מלא) סביב תיבת הכפתור, פלוס חץ עקום שמצביע אליו
// מלמטה-שמאל - שימוש בדף חדש באותו דפדפן שכבר פתוח, כדי לא לפתוח כרום נוסף בשביל צעד קטן כזה
async function compositeCtaHighlight(
  browser: Browser,
  imageBase64: string,
  width: number,
  height: number,
  ctaBox: { x: number; y: number; width: number; height: number }
): Promise<string> {
  const padX = 22;
  const padY = 14;
  const ovalLeft = ctaBox.x - padX;
  const ovalTop = ctaBox.y - padY;
  const ovalW = ctaBox.width + padX * 2;
  const ovalH = ctaBox.height + padY * 2;

  const arrowW = 90;
  const arrowH = 100;
  const arrowLeft = ovalLeft - arrowW * 0.55;
  const arrowTop = ovalTop + ovalH - arrowH * 0.35;

  const html = `<!DOCTYPE html><html><head><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${width}px; height: ${height}px; overflow: hidden; position: relative; }
    img { position: absolute; top: 0; left: 0; width: ${width}px; height: ${height}px; display: block; }
    .oval {
      position: absolute; left: ${ovalLeft}px; top: ${ovalTop}px; width: ${ovalW}px; height: ${ovalH}px;
      border: 4px solid ${HIGHLIGHT_COLOR}; border-radius: 999px; transform: rotate(-2deg);
      filter: drop-shadow(0 2px 6px rgba(0,0,0,0.35));
    }
    .arrow { position: absolute; left: ${arrowLeft}px; top: ${arrowTop}px; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.35)); }
  </style></head><body>
    <img src="data:image/png;base64,${imageBase64}" />
    <div class="oval"></div>
    <div class="arrow">${upRightArrowSvg(HIGHLIGHT_COLOR)}</div>
  </body></html>`;

  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height });
    await page.setContent(html, { waitUntil: 'load' });
    const buf = Buffer.from(await page.screenshot({ type: 'png' }));
    return buf.toString('base64');
  } finally {
    await page.close();
  }
}

export async function captureSitePageScreenshot(rawUrl: string): Promise<string> {
  const url = assertAllowedUrl(rawUrl);

  const executablePath = await chromium.executablePath();
  const fontsDir = path.join(os.tmpdir(), 'fonts');
  await waitForFontsExtracted(fontsDir);

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: VIEWPORT_WIDTH, height: 1000 },
    executablePath,
    headless: true,
    env: { ...process.env, FONTCONFIG_PATH: fontsDir, HOME: os.tmpdir() },
  });

  try {
    const page = await browser.newPage();
    await page.goto(url.toString(), { waitUntil: 'networkidle0', timeout: 25000 });

    await page.evaluate((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
    }, HIDE_SELECTORS);

    let targetHandle: ElementHandle<Element> | null = null;
    if (url.hash) {
      const id = decodeURIComponent(url.hash.slice(1));
      const handle = await page.evaluateHandle((elId) => document.getElementById(elId), id);
      targetHandle = handle.asElement() as ElementHandle<Element> | null;
      if (targetHandle) {
        await targetHandle.scrollIntoView();
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }

    let screenshotBase64: string;
    let width: number;
    let height: number;
    let ctaBox: { x: number; y: number; width: number; height: number } | null = null;
    let boxOrigin = { x: 0, y: 0 };

    if (targetHandle) {
      // צילום מדויק רק של האלמנט עם ה-id שבעוגן - חתוך אוטומטית לגובה התוכן האמיתי שלו,
      // בלי שטח ריק מיותר מסביב ובלי הדר/ניווט העמוד
      const box = await targetHandle.boundingBox();
      const buf = (await targetHandle.screenshot({ type: 'png' })) as Buffer;
      screenshotBase64 = buf.toString('base64');
      width = Math.round(box?.width || VIEWPORT_WIDTH);
      height = Math.round(box?.height || 400);
      boxOrigin = { x: box?.x || 0, y: box?.y || 0 };

      const cta = await targetHandle.$(CTA_SELECTOR);
      if (cta) ctaBox = await cta.boundingBox();
    } else {
      // אין עוגן - מודדים את הגובה האמיתי של תוכן העמוד (מוגבל לתקרה סבירה) במקום ויופורט
      // קבוע, כדי לא לקבל שטח ריק ענק מתחת לתוכן כשהעמוד קצר
      const contentHeight = await page.evaluate(() => document.body.scrollHeight);
      height = Math.max(400, Math.min(contentHeight, MAX_FALLBACK_HEIGHT));
      width = VIEWPORT_WIDTH;
      await page.setViewport({ width, height });
      const buf = (await page.screenshot({ type: 'png' })) as Buffer;
      screenshotBase64 = buf.toString('base64');

      const cta = await page.$(CTA_SELECTOR);
      if (cta) ctaBox = await cta.boundingBox();
    }

    if (ctaBox) {
      const relBox = { x: ctaBox.x - boxOrigin.x, y: ctaBox.y - boxOrigin.y, width: ctaBox.width, height: ctaBox.height };
      const fitsInFrame = relBox.x > 0 && relBox.y > 0 && relBox.x + relBox.width < width && relBox.y + relBox.height < height;
      if (fitsInFrame) {
        screenshotBase64 = await compositeCtaHighlight(browser, screenshotBase64, width, height, relBox);
      }
    }

    return screenshotBase64;
  } finally {
    await browser.close();
  }
}
