import { NextResponse } from 'next/server';
import { supabaseAdmin, sendLoginEmail } from '@/lib/instantLogin';
import { ensureActiveSubscriberAccount } from '@/lib/subscriberStatus';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;
  return user;
}

// POST - הופך איש קשר CRM (שאינו מנוי) למנוי פעיל: יוצר/מאשר לו חשבון באתר ושולח קישור כניסה,
// ומעדכן את שלב איש הקשר ב-CRM ל"מנוי" עם קישור לחשבון שנוצר
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { contactId } = await request.json().catch(() => ({}));
  if (!contactId) return NextResponse.json({ error: 'חסר מזהה איש קשר' }, { status: 400 });

  const { data: contact } = await supabaseAdmin.from('crm_contacts').select('*').eq('id', contactId).maybeSingle();
  if (!contact) return NextResponse.json({ error: 'איש קשר לא נמצא' }, { status: 404 });
  if (!contact.email) return NextResponse.json({ error: 'אין מייל לאיש הקשר - לא ניתן ליצור חשבון באתר' }, { status: 400 });

  try {
    await ensureActiveSubscriberAccount(contact.email, contact.phone || '', contact.full_name || contact.email);
    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('email', contact.email).maybeSingle();

    await supabaseAdmin
      .from('crm_contacts')
      .update({
        stage: 'subscriber',
        profile_id: profile?.id || null,
        joined_at: contact.joined_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId);

    await sendLoginEmail(contact.email).catch((e) => console.error('שגיאה בשליחת מייל כניסה בקידום מה-CRM', e));

    return NextResponse.json({ ok: true, profileId: profile?.id || null });
  } catch (e) {
    console.error('שגיאה בקידום איש קשר CRM למנוי', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בקידום למנוי' }, { status: 500 });
  }
}
