import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// PATCH - עדכון ידני של "עלות חודשית" למנוי/ה ספציפי/ת - בדרך כלל השדה הזה מתעדכן אוטומטית
// בסנכרון היומי מול מאנדיי (lib/mondaySubscriberSync.ts), אבל מנוי/ה שלא קיימ/ת במאנדיי בכלל
// (למשל חשבון בדיקה, או גישה שניתנה ידנית) נשאר/ת עם monthly_price=null לצמיתות, ואז חישוב
// ההכנסה מניח ערך ברירת מחדל (400) בלי שום דרך לתקן את זה - זה פותח דרך ישירה לקבוע את הערך
// האמיתי. null מוחק את הערך הידני וחוזר להסתמך שוב על הסנכרון/ברירת המחדל
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { monthlyPrice } = await request.json().catch(() => ({}));
  if (monthlyPrice !== null && (typeof monthlyPrice !== 'number' || !Number.isFinite(monthlyPrice) || monthlyPrice < 0)) {
    return NextResponse.json({ error: 'מחיר לא תקין' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ monthly_price: monthlyPrice })
    .eq('id', params.id)
    .select('id, monthly_price')
    .single();

  if (error) return NextResponse.json({ error: 'שגיאה בעדכון' }, { status: 500 });

  return NextResponse.json({ ok: true, monthlyPrice: data.monthly_price });
}
