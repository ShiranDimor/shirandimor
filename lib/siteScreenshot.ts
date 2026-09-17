// צילום מסך אמיתי של עמוד באתר שירן עצמו (shirandimor.com) - לשימוש בסטורי "מהאתר" (למשל
// אזור שיווקי ספציפי שהיא כבר עיצבה באתר, בלי לבנות תבנית גרפית נפרדת בקוד). מוגבל במפורש
// לדומיין של האתר בלבד (לא כלי צילום-מסך כללי לכל URL) - זה כלי אדמין פנימי, לא צריך יותר מזה.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import type { ElementHandle } from 'puppeteer-core';
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

    if (targetHandle) {
      // צילום מדויק רק של האלמנט עם ה-id שבעוגן - חתוך אוטומטית לגובה התוכן האמיתי שלו,
      // בלי שטח ריק מיותר מסביב ובלי הדר/ניווט העמוד
      const buf = (await targetHandle.screenshot({ type: 'png' })) as Buffer;
      screenshotBase64 = buf.toString('base64');
    } else {
      // אין עוגן - מודדים את הגובה האמיתי של תוכן העמוד (מוגבל לתקרה סבירה) במקום ויופורט
      // קבוע, כדי לא לקבל שטח ריק ענק מתחת לתוכן כשהעמוד קצר
      const contentHeight = await page.evaluate(() => document.body.scrollHeight);
      const height = Math.max(400, Math.min(contentHeight, MAX_FALLBACK_HEIGHT));
      await page.setViewport({ width: VIEWPORT_WIDTH, height });
      const buf = (await page.screenshot({ type: 'png' })) as Buffer;
      screenshotBase64 = buf.toString('base64');
    }

    return screenshotBase64;
  } finally {
    await browser.close();
  }
}
