import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { createContact } from '@/lib/crm';
import type { CrmStage } from '@/lib/crm';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;
  return user;
}

// POST - יצירת איש קשר CRM ידני, עם הערת פתיחה אוטומטית בציר הזמן (ר' lib/crm.ts:createContact)
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { fullName, phone, email, stage } = body as { fullName?: string; phone?: string; email?: string; stage?: CrmStage };
  if (!fullName || (!phone && !email)) {
    return NextResponse.json({ error: 'צריך שם, וטלפון או מייל' }, { status: 400 });
  }

  try {
    const contact = await createContact({ fullName, phone, email, stage }, admin.email || 'admin');
    return NextResponse.json({ ok: true, contact });
  } catch (e) {
    console.error('שגיאה ביצירת איש קשר CRM', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה ביצירה' }, { status: 500 });
  }
}
