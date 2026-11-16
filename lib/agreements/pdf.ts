// הפקת PDF של ההסכם החתום (כולל החתימה ביד) בכרום ללא ממשק - אותו מנגנון שכבר משמש באתר לתמונות השיווק
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import os from 'os';
import path from 'path';
import fs from 'fs';

async function waitForFonts(fontsDir: string) {
  for (let i = 0; i < 20; i++) {
    try {
      if (fs.readdirSync(path.join(fontsDir, 'fonts', 'Open_Sans')).length > 0) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
}

export function agreementPdfHtml(bodyHtml: string, signaturePng?: string) {
  const signature = signaturePng
    ? `<div style="margin-top:18px"><h3 style="margin:0 0 6px">חתימה ביד</h3><img alt="" style="border:1px solid #ccc;width:300px" src="${signaturePng}"></div>`
    : '';
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>@import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;600;700&display=swap');
body{font-family:'Rubik',Arial,sans-serif;direction:rtl;color:#1a1a1a;margin:0;font-size:12.5px}
div,p,li,td,h2,h3{font-family:'Rubik',Arial,sans-serif !important}
h3{page-break-after:avoid} table,img{page-break-inside:avoid}</style></head>
<body>${bodyHtml}${signature}</body></html>`;
}

export async function renderPdf(html: string): Promise<Buffer> {
  const executablePath = await chromium.executablePath();
  const fontsDir = path.join(os.tmpdir(), 'fonts');
  await waitForFonts(fontsDir);
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true,
    env: { ...process.env, FONTCONFIG_PATH: fontsDir, HOME: os.tmpdir() },
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
