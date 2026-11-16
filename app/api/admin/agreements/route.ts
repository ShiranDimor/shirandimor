import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { AGREEMENTS, getAgreement, signLink } from '@/lib/agreements';
import { clean } from '@/lib/businessLead';

export const dynamic = 'force-dynamic';

async function requireAdmin(request: Request) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'admin' ? user : null;
}

// GET - רשימת ההסכמים + החתימות האחרונות (בלי תמונת החתימה, שהיא כבדה)
export async function GET(request: Request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });
  const { data, error } = await supabaseAdmin
    .from('agreement_signatures')
    .select('id, created_at, agreement_id, agreement_version, full_name, id_number, phone, email, terms')
    .order('created_at', { ascending: false })
    .limit(500);
  return NextResponse.json({
    agreements: AGREEMENTS.map((a) => ({ id: a.id, title: a.title, version: a.version, active: a.active, termFields: a.termFields })),
    signatures: data || [],
    dbError: error ? 'לא הצלחנו לטעון חתימות' : null,
  });
}

// POST {agreementId, terms} - יצירת קישור חתימה אישי עם התנאים שנקבעו
export async function POST(request: Request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const agreement = getAgreement(clean(body.agreementId, 40));
  if (!agreement) return NextResponse.json({ error: 'הסכם לא מוכר' }, { status: 400 });
  const terms: Record<string, string> = {};
  for (const f of agreement.termFields) terms[f.key] = clean(body.terms?.[f.key], 200);
  const origin = new URL(request.url).origin;
  const url = agreement.termFields.length > 0 ? `${origin}/agreement/${agreement.id}?t=${signLink(agreement, terms)}` : `${origin}/agreement/${agreement.id}`;
  return NextResponse.json({ url });
}
