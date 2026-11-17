import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { syncGrowPaymentToMonday } from '@/lib/grow';

async function requireAdmin(request: Request): Promise<unknown> {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (process.env.AGENT_ADMIN_SECRET && token === process.env.AGENT_ADMIN_SECRET) return true;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  return adminProfile?.role === 'admin' ? user : null;
}

// POST - תיקון חד-פעמי לעמודות של מנוי/ה שכבר קיים/ת במאנדיי (עלות/תאריך הרשמה/הטבה), בלי
// לגעת בחשבון שלו/ה באתר או לשלוח לו/ה שוב מייל כניסה - ר' מקרים שבהם change_multiple_column_values
// נכשל בשקט (מוקי, אסף) ונשאר תקוע על ערך ישן/שגוי אחרי שהסנכרון האוטומטי כבר "חשב" שהוא הצליח
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const amount = typeof body?.amount === 'number' ? body.amount : null;

  if ((!phone && !email) || amount == null) {
    return NextResponse.json({ error: 'חסר phone/email או amount' }, { status: 400 });
  }

  const result = await syncGrowPaymentToMonday({
    phone: phone || null,
    email: email || null,
    fullName: name || null,
    amount,
    transactionId: null,
    webhookKey: null,
  });

  return NextResponse.json(result);
}
