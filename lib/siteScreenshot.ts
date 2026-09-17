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
const ARROW_COLOR = '#E8A33D'; // כתום - בולט על רקע כהה ומנוגד לכפתורי הטורקיז/סגול שבאתר
const CTA_SELECTOR = '.btn-primary, .cta-main, a.btn-primary, button.btn-primary';

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

// חץ עקום פשוט ב-SVG (לא אימוג'י - לא רץ גופן אימוג'י בבינארי המצומצם) שמצביע כלפי מטה,
// להפניית תשומת לב לכפתור קריאה-לפעולה שנמצא בתוך הצילום
function downArrowSvg(color: string): string {
  return `<svg width="70" height="90" viewBox="0 0 70 90" fill="none">
    <path d="M35 4 C 18 28, 52 52, 35 76" stroke="${color}" stroke-width="6" stroke-linecap="round" fill="none"/>
    <path d="M16 58 L35 80 L54 58" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`;
}

// מרכיב חץ צבעוני מעל תמונה קיימת (בהתבסס על קואורדינטות שכבר נמדדו יחסית לתמונה) - שימוש
// בדף חדש באותו דפדפן שכבר פתוח, כדי לא לפתוח כרום נוסף בשביל צעד קטן כזה
async function compositeArrowAbove(
  browser: Browser,
  imageBase64: string,
  width: number,
  height: number,
  targetCenterX: number,
  targetTopY: number
): Promise<string> {
  const arrowHeight = 90;
  const gap = 10;
  const top = Math.max(4, targetTopY - arrowHeight - gap);
  const left = Math.round(targetCenterX - 35);

  const html = `<!DOCTYPE html><html><head><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${width}px; height: ${height}px; overflow: hidden; position: relative; }
    img { position: absolute; top: 0; left: 0; width: ${width}px; height: ${height}px; display: block; }
    .arrow { position: absolute; top: ${top}px; left: ${left}px; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.35)); }
  </style></head><body>
    <img src="data:image/png;base64,${imageBase64}" />
    <div class="arrow">${downArrowSvg(ARROW_COLOR)}</div>
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
      // בלי שטח ריק מיותר מסביב
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
      const centerX = ctaBox.x - boxOrigin.x + ctaBox.width / 2;
      const topY = ctaBox.y - boxOrigin.y;
      if (centerX > 0 && centerX < width && topY > 0 && topY < height) {
        screenshotBase64 = await compositeArrowAbove(browser, screenshotBase64, width, height, centerX, topY);
      }
    }

    return screenshotBase64;
  } finally {
    await browser.close();
  }
}
