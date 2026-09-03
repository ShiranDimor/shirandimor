import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
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

// POST - הענקת חשבון מנוי/ה ידנית (לא דרך מאנדיי) - לשימוש במקרים חד-פעמיים כמו הרשמה לניסיון
// שאינה עוברת דרך תהליך התשלום/מאנדיי הרגיל. משתמש באותה ensureActiveSubscriberAccount שכל
// שאר האתר משתמש בה, כדי שההתחברות (קישור למייל) תעבוד בדיוק כמו לכל מנוי אחר.
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim() : '';

  if (!name || !email) {
    return NextResponse.json({ error: 'חסר שם או מייל' }, { status: 400 });
  }

  try {
    await ensureActiveSubscriberAccount(email, phone, name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה ביצירת החשבון' }, { status: 500 });
  }
}
