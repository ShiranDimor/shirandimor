import { NextResponse } from 'next/server';
import { clean } from '@/lib/businessLead';
import { supabaseAdmin } from '@/lib/instantLogin';
import { OWNER_EMAIL } from '@/lib/tradeClosedAlert';
import { contentHash, getAgreement, readLink, signedAgreementHtml } from '@/lib/agreements';
import type { Terms } from '@/lib/agreements/types';

export const dynamic = 'force-dynamic';

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
    const attachments = [
      { filename: 'signature.png', content: signature.replace('data:image/png;base64,', '') },
      { filename: `${agreement.id}-agreement-signed.html`, content: Buffer.from(`<!doctype html><meta charset="utf-8">${html}`).toString('base64') },
    ];
    const send = (to: string, replyTo: string, subject: string, intro: string) =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: 'שירן דימור <noreply@shirandimor.com>',
          to,
          reply_to: replyTo,
          subject,
          html: `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;background:#ffffff;color:#1a1a1a;padding:8px"><p>${intro}</p></div>${html}`,
          attachments,
        }),
      }).then((r) => r.ok);
    const [toOwner, toSigner] = await Promise.all([
      send(OWNER_EMAIL, signer.email, `נחתם: ${agreement.title} - ${signer.fullName}`, `${signer.fullName} חתם/ה על ההסכם. העותק החתום מצורף.`).catch(() => false),
      send(signer.email, OWNER_EMAIL, `העותק החתום שלך: ${agreement.title}`, `היי ${signer.fullName.split(' ')[0]}, תודה! זה העותק החתום של ההסכם, לשמירה.`).catch(() => false),
    ]);
    emailed = toOwner || toSigner;
  }

  if (dbError && !emailed) return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 502 });
  return NextResponse.json({ ok: true, signedAt });
}
