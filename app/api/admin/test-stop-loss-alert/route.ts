import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { sendSampleTradeClosedAlerts } from '@/lib/tradeClosedAlert';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// POST - שליחת דוגמה ידנית של מייל "עסקה נסגרה" למנויים (אחת ברווח, אחת בהפסד בסטופ),
// לכתובת הבדיקה בלבד - כדי לראות איך זה נראה בלי לחכות לסגירה אמיתית בתיק
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  try {
    await sendSampleTradeClosedAlerts();
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה לא ידועה' }, { status: 500 });
  }
}
