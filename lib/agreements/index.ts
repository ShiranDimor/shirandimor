// רישום כל ההסכמים. הסכם חדש = קובץ חדש בתיקייה + שורה כאן.
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { env } from '../googleCalendar';
import { mentoringAgreement } from './mentoring';
import { subscribersAgreement } from './subscribers';
import type { AgreementBlock, AgreementTemplate, Terms } from './types';

export const AGREEMENTS: AgreementTemplate[] = [mentoringAgreement, subscribersAgreement];

export function getAgreement(id: string) {
  return AGREEMENTS.find((a) => a.id === id) || null;
}

// ===== קישור אישי: התנאים מקודדים בקישור + חתימת HMAC - אי אפשר לשנות מחיר/תשלומים בקישור =====

const LINK_VALID_DAYS = 30;

function secret() {
  return process.env.AGREEMENT_SECRET || process.env.CALL_MANAGE_SECRET || env('GOOGLE_CALENDAR_CLIENT_SECRET');
}

type Signed = { a: string; v: string; terms: Terms; iat: number };

export function signLink(agreement: AgreementTemplate, terms: Terms) {
  const payload = Buffer.from(JSON.stringify({ a: agreement.id, v: agreement.version, terms, iat: Date.now() } satisfies Signed), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret()).update(`agreement:${payload}`).digest('base64url').slice(0, 32);
  return `${payload}.${sig}`;
}

export function readLink(agreementId: string, token: string): { terms: Terms; expired?: boolean } | null {
  const [payload, sig] = (token || '').split('.');
  if (!payload || !sig || !secret()) return null;
  const expected = Buffer.from(createHmac('sha256', secret()).update(`agreement:${payload}`).digest('base64url').slice(0, 32));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Signed;
    if (data.a !== agreementId) return null;
    if (Date.now() - Number(data.iat) > LINK_VALID_DAYS * 24 * 3600 * 1000) return { terms: data.terms, expired: true };
    return { terms: data.terms || {} };
  } catch {
    return null;
  }
}

// טביעת אצבע של הנוסח המדויק שנחתם - נשמרת עם החתימה, כדי להוכיח בדיוק על מה חתמו
export function contentHash(blocks: AgreementBlock[]) {
  return createHash('sha256').update(JSON.stringify(blocks)).digest('hex');
}

const esc = (s: string) => (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

// HTML של ההסכם החתום (גוף המייל + קובץ מצורף)
export function signedAgreementHtml(opts: {
  agreement: AgreementTemplate;
  blocks: AgreementBlock[];
  signer: { fullName: string; idNumber: string; phone: string; email: string; address: string; typedName: string };
  signedAt: string;
  audit: string;
}) {
  const rows = (r: [string, string][]) =>
    `<table style="border-collapse:collapse;margin:8px 0">${r
      .map(([k, v]) => `<tr><td style="border:1px solid #ccc;padding:6px 10px;background:#f6f4f2">${esc(k)}</td><td style="border:1px solid #ccc;padding:6px 10px">${esc(v)}</td></tr>`)
      .join('')}</table>`;
  const body = opts.blocks
    .map((b) => {
      let s = `<h3 style="margin:18px 0 6px">${esc(b.h)}</h3>`;
      if (b.p) s += b.p.map((x) => `<p style="margin:4px 0">${esc(x)}</p>`).join('');
      if (b.table) s += rows(b.table);
      if (b.ul) s += `<ul>${b.ul.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
      if (b.ol) s += `<ol>${b.ol.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`;
      return s;
    })
    .join('');
  const s = opts.signer;
  return `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;background:#ffffff;line-height:1.6;max-width:720px;padding:8px">
<h2 style="margin:0 0 4px">${esc(opts.agreement.title)}</h2>
<p style="color:#666;margin:0 0 12px">נחתם דיגיטלית ב-${esc(opts.signedAt)} · גרסת נוסח ${esc(opts.agreement.version)}</p>
<h3 style="margin:18px 0 6px">פרטי החותם/ת</h3>
${rows([['שם מלא', s.fullName], ['ת.ז', s.idNumber], ['טלפון', s.phone], ['מייל', s.email], ['כתובת', s.address]])}
${body}
<h3 style="margin:18px 0 6px">אישור וחתימה</h3>
<p style="margin:4px 0">החותם/ת אישר/ה שקרא/ה את ההסכם והוא מקובל עליו/ה, וחתם/ה בשמו/ה המלא: <strong>${esc(s.typedName)}</strong>. החתימה ביד מצורפת כקובץ (signature.png).</p>
<p style="color:#888;font-size:12px;margin-top:16px">תיעוד: ${esc(opts.audit)}</p>
</div>`;
}
