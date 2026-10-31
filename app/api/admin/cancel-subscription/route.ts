import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

// POST - ביטול מנוי ידני: מסמן subscription_status="cancelled" ומאבד גישה מיידית (role נשאר
// "subscriber" בכוונה - כדי שהוא יישאר גלוי ומזוהה כמנוי-לשעבר בפאנל הניהול, לא יתערבב סתם
// ברשימת לידים חדשים שאין לה שום קשר אליו. לא מוחק חשבון/נתונים - למחיקה מלאה יש כפתור נפרד)
// body: { userId: string }
export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'לא מחוברים' }, { status: 401 });

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { userId } = await request.json().catch(() => ({}));
  if (!userId) return NextResponse.json({ error: 'חסר מזהה משתמש' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ subscription_status: 'cancelled', subscription_cancelled_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) return NextResponse.json({ error: 'שגיאה בביטול המנוי' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
