import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { syncGenericLead } from '@/lib/tradingPlan/monday';

const TRIAL_SOURCE_LABEL = 'ימי ניסיון - עדכונים (7 ימים)';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// יוצר מחדש כרטיס ליד במאנדיי לנרשם/ת קיים/ת - לשימוש במי שנרשם עוד לפני התיקון ל-forceNew
// (וקיבל רק הערה על כרטיס קיים במקום כרטיס חדש בלידים חדשים), או בכל מקרה שצריך לוודא שהליד
// אכן מופיע שם
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { id } = await request.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 });

  const { data: signup, error } = await supabaseAdmin
    .from('trial_signups')
    .select('name, phone')
    .eq('id', id)
    .single();

  if (error || !signup) return NextResponse.json({ error: 'הנרשם/ת לא נמצא/ה' }, { status: 404 });

  const result = await syncGenericLead({
    phone: signup.phone,
    name: signup.name,
    source: TRIAL_SOURCE_LABEL,
    note: `נרשם/ה ל-7 ימי ניסיון (סונכרן ידנית)\nנייד: ${signup.phone}`,
    forceNew: true,
  });

  if (!result.ok) {
    return NextResponse.json({ error: 'הסנכרון למאנדיי נכשל: ' + (result.reason || 'שגיאה') }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
