// צילום מסך אמיתי של עמוד באתר שירן עצמו (shirandimor.com) - לשימוש בסטורי "מהאתר" (למשל
// אזור שיווקי ספציפי שהיא כבר עיצבה באתר, בלי לבנות תבנית גרפית נפרדת בקוד). מוגבל במפורש
// לדומיין של האתר בלבד (לא כלי צילום-מסך כללי לכל URL) - זה כלי אדמין פנימי, לא צריך יותר מזה.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import os from 'os';
import path from 'path';
import fs from 'fs';

const ALLOWED_HOSTS = ['shirandimor.com', 'www.shirandimor.com'];

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

// מצלמת ויופורט מובייל (לא clip - אותה בעיה ידועה עם clip ב-chrome-headless-shell שגורמת
// לטקסט להיעלם, ראו lib/marketingCardImage.ts) אחרי גלילה ל-hash אם קיים בכתובת, כדי לתפוס
// בדיוק את האזור הרלוונטי בעמוד ולא רק את החלק העליון
export async function captureSitePageScreenshot(rawUrl: string): Promise<string> {
  const url = assertAllowedUrl(rawUrl);

  const executablePath = await chromium.executablePath();
  const fontsDir = path.join(os.tmpdir(), 'fonts');
  await waitForFontsExtracted(fontsDir);

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 430, height: 1100 },
    executablePath,
    headless: true,
    env: { ...process.env, FONTCONFIG_PATH: fontsDir, HOME: os.tmpdir() },
  });

  try {
    const page = await browser.newPage();
    await page.goto(url.toString(), { waitUntil: 'networkidle0', timeout: 25000 });

    if (url.hash) {
      const id = decodeURIComponent(url.hash.slice(1));
      await page.evaluate((elementId) => {
        document.getElementById(elementId)?.scrollIntoView({ block: 'start' });
      }, id);
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    const buffer = Buffer.from(await page.screenshot({ type: 'png' }));
    return buffer.toString('base64');
  } finally {
    await browser.close();
  }
}
