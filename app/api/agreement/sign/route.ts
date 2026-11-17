import { NextResponse } from 'next/server';
import { clean } from '@/lib/businessLead';
import { supabaseAdmin } from '@/lib/instantLogin';
import { OWNER_EMAIL } from '@/lib/tradeClosedAlert';
import { sendPushToAdmins } from '@/lib/webPush';
import { agreementPdfHtml, renderPdf } from '@/lib/agreements/pdf';
import { contentHash, getAgreement, readLink, signedAgreementHtml } from '@/lib/agreements';
import type { Terms } from '@/lib/agreements/types';

export const dynamic = 'force-dynamic';
// הפקת ה-PDF בכרום לוקחת כמה שניות
export const maxDuration = 60;

const MAX_SIGNATURE_BYTES = 400_000;

// חתימה דיגיטלית על הסכם: בודקת את הקישור (אם ההסכם עם תנאים אישיים), שומרת את החתימה בטבלה
// agreement_signatures ושולחת עותק חתום במייל לשירן ולחותם/ת. בלי שמירה וגם בלי מייל = כישלון.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  }

  const agreement = getAgreement(clean(body.agreementId, 40));
  if (!agreement || !agreement.active) return NextResponse.json({ error: 'ההסכם לא זמין לחתימה' }, { status: 404 });

  let terms: Terms = {};
  if (agreement.termFields.length > 0) {
    const link = readLink(agreement.id, clean(body.t, 4000));
    if (!link) return NextResponse.json({ error: 'הקישור לא תקין' }, { status: 403 });
    if (link.expired) return NextResponse.json({ error: 'הקישור פג תוקף - צריך לבקש קישור חדש' }, { status: 410 });
    terms = link.terms;
  }
  // הבחירה שמשנה את נוסח ההסכם (מסלול) - חובה, ורק מתוך האפשרויות
  if (agreement.variant) {
    const v = clean((body.choices as Record<string, unknown> | undefined)?.[agreement.variant.key], 40);
    if (!agreement.variant.options.some((o) => o.value === v)) return NextResponse.json({ error: `נשאר לבחור: ${agreement.variant.label}` }, { status: 400 });
    terms[agreement.variant.key] = v;
  }
  // בחירות שהחותם/ת ממלא/ת בעצמו/ה (רק ערכים מתוך הרשימה)
  for (const c of agreement.signerChoices || []) {
    const v = clean((body.choices as Record<string, unknown> | undefined)?.[c.key], 60);
    if (!c.options.includes(v)) return NextResponse.json({ error: `נשאר לבחור: ${c.label}` }, { status: 400 });
    terms[c.key] = v;
  }

  const signer = {
    fullName: clean(body.fullName, 100),
    idNumber: clean(body.idNumber, 20),
    phone: clean(body.phone, 20),
    email: clean(body.email, 120),
    address: clean(body.address, 200),
    typedName: clean(body.typedName, 100),
  };
  const signature = typeof body.signature === 'string' ? body.signature : '';
  if (
    !signer.fullName ||
    !/^\d{5,9}$/.test(signer.idNumber.replace(/\D/g, '')) ||
    signer.phone.replace(/\D/g, '').length < 9 ||
    !signer.email.includes('@') ||
    !signer.address ||
    !signer.typedName ||
    body.agree !== true ||
    !signature.startsWith('data:image/png;base64,') ||
    signature.length > MAX_SIGNATURE_BYTES
  ) {
    return NextResponse.json({ error: 'חסרים פרטים, אישור או חתימה' }, { status: 400 });
  }

  const blocks = agreement.blocks(terms);
  const hash = contentHash(blocks);
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const userAgent = clean(request.headers.get('user-agent'), 300);
  const signedAt = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  const audit = `IP ${ip || 'לא ידוע'} · ${userAgent} · טביעת נוסח ${hash.slice(0, 16)}`;

  const { error: dbError } = await supabaseAdmin.from('agreement_signatures').insert({
    agreement_id: agreement.id,
    agreement_version: agreement.version,
    full_name: signer.fullName,
    id_number: signer.idNumber,
    phone: signer.phone,
    email: signer.email,
    address: signer.address,
    typed_name: signer.typedName,
    terms,
    signature_png: signature,
    ip,
    user_agent: userAgent,
    content_hash: hash,
  });
  if (dbError) console.error('שגיאה בשמירת חתימה על הסכם', dbError);

  const html = signedAgreementHtml({ agreement, blocks, signer, signedAt, audit });
  const apiKey = process.env.RESEND_API_KEY;
  let emailed = false;
  if (apiKey) {
    // ההסכם החתום כקובץ PDF מצורף (כולל החתימה ביד). אם הפקת ה-PDF נכשלה - נשלח את ההסכם בגוף המייל, כגיבוי
    let pdf: Buffer | null = null;
    try {
      pdf = await renderPdf(agreementPdfHtml(html, signature));
    } catch (e) {
      console.error('שגיאה בהפקת PDF להסכם חתום', e);
    }
    const fileName = `הסכם-${signer.fullName}.pdf`.replace(/[\\/:*?"<>|]/g, '');
    const attachments = pdf
      ? [{ filename: fileName, content: pdf.toString('base64') }]
      : [{ filename: 'signature.png', content: signature.replace('data:image/png;base64,', '') }];
    const bodyFor = (intro: string) =>
      pdf
        ? `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;background:#ffffff;color:#1a1a1a;padding:8px;line-height:1.6"><p>${intro}</p><p>ההסכם החתום מצורף כקובץ PDF.</p><p style="color:#888;font-size:12px">${agreement.title} · נחתם ב-${signedAt}</p></div>`
        : `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;background:#ffffff;color:#1a1a1a;padding:8px"><p>${intro}</p></div>${html}`;
    const send = (to: string, replyTo: string, subject: string, intro: string) =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: 'שירן דימור <noreply@shirandimor.com>',
          to,
          reply_to: replyTo,
          subject,
          html: bodyFor(intro),
          attachments,
        }),
      }).then((r) => r.ok);
    const [toOwner, toSigner] = await Promise.all([
      send(OWNER_EMAIL, signer.email, `נחתם: ${agreement.title} - ${signer.fullName}`, `${signer.fullName} חתם/ה על ההסכם. העותק החתום מצורף.`).catch(() => false),
      send(signer.email, OWNER_EMAIL, `העותק החתום שלך: ${agreement.title}`, `היי ${signer.fullName.split(' ')[0]}, תודה! זה העותק החתום של ההסכם, לשמירה.`).catch(() => false),
    ]);
    emailed = toOwner || toSigner;
  }

  // התראה לשירן בטלפון (פוש לאדמין) על כל חתימה
  const trackLabel = agreement.variant?.options.find((o) => o.value === terms[agreement.variant!.key])?.label;
  await sendPushToAdmins(
    { title: `✍️ נחתם הסכם: ${signer.fullName}`, body: trackLabel || agreement.title, url: '/admin/agreements' },
    'announcement'
  ).catch((e) => console.error('שגיאה בשליחת התראת חתימה לאדמין', e));

  if (dbError && !emailed) return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 502 });
  return NextResponse.json({ ok: true, signedAt });
}
