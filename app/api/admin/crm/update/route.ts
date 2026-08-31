import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { updateContactById } from '@/lib/crm';
import type { ContactFieldUpdate } from '@/lib/crm';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;
  return user;
}

// POST - עדכון שדות של איש קשר קיים ב-CRM. מתעד אוטומטית בציר הזמן כל שינוי בשלב/סטטוס/פולואפ
// (ר' lib/crm.ts:updateContactById) - כלי הפיתוח פנימי, לא מחובר לשום זרימה אמיתית באתר
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { contactId, ...update } = body as { contactId?: string } & ContactFieldUpdate;
  if (!contactId) return NextResponse.json({ error: 'חסר מזהה איש קשר' }, { status: 400 });

  try {
    const contact = await updateContactById(contactId, update, admin.email || 'admin');
    return NextResponse.json({ ok: true, contact });
  } catch (e) {
    console.error('שגיאה בעדכון איש קשר CRM', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בעדכון' }, { status: 500 });
  }
}
