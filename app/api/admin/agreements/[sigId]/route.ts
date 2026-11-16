import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { contentHash, getAgreement, signedAgreementHtml } from '@/lib/agreements';

export const dynamic = 'force-dynamic';

async function requireAdmin(request: Request) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'admin' ? user : null;
}

// GET - ההסכם החתום המלא (HTML עם החתימה ביד), לצפייה / הורדה / שמירה כ-PDF מעמוד הניהול
export async function GET(request: Request, { params }: { params: { sigId: string } }) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });
  const { data: row } = await supabaseAdmin.from('agreement_signatures').select('*').eq('id', params.sigId).maybeSingle();
  if (!row) return NextResponse.json({ error: 'החתימה לא נמצאה' }, { status: 404 });
  const agreement = getAgreement(row.agreement_id);
  if (!agreement) return NextResponse.json({ error: 'הסכם לא מוכר' }, { status: 404 });

  const blocks = agreement.blocks(row.terms || {});
  // הנוסח נבנה מחדש מהתבנית; אם התבנית השתנתה מאז החתימה - מציינים זאת (טביעת הנוסח המקורית שמורה)
  const sameText = contentHash(blocks) === row.content_hash;
  const signedAt = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'long', timeStyle: 'short' }).format(new Date(row.created_at));
  const html = signedAgreementHtml({
    agreement: { ...agreement, version: row.agreement_version },
    blocks,
    signer: { fullName: row.full_name, idNumber: row.id_number || '', phone: row.phone || '', email: row.email || '', address: row.address || '', typedName: row.typed_name },
    signedAt,
    audit: `IP ${row.ip || 'לא ידוע'} · ${row.user_agent || ''} · טביעת נוסח ${String(row.content_hash || '').slice(0, 16)}${sameText ? '' : ' · שימו לב: נוסח התבנית עודכן אחרי החתימה'}`,
  });
  const signature = row.signature_png ? `<div dir="rtl" style="font-family:Arial;padding:0 8px"><h3>חתימה ביד</h3><img alt="חתימה" style="border:1px solid #ccc;max-width:360px;width:100%" src="${row.signature_png}"></div>` : '';
  return NextResponse.json({ html: html + signature, fileName: `הסכם-${row.full_name}-${String(row.created_at).slice(0, 10)}` });
}
