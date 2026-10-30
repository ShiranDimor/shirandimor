import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { sendPushToActiveSubscribers, sendPushToNonSubscribers } from '@/lib/webPush';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// POST - שולח התראת פוש שעסקה חדשה נפתחה בתיק. למנויים - עם כל הפרטים (סימבול, כיוון, כניסה,
// סטופ). למי שאינו מנוי - גרסה מטושטשת בלי הסימבול, כדי לשמור את הערך שהמנוי משלם עליו, אבל
// עדיין לתת תחושה של "קורה משהו עכשיו" כדי לעודד הצטרפות. נקרא מה-client מיד אחרי שהעסקה
// נוספה בהצלחה דרך supabase ישירות (לא דרך ה-route הזה) - זה רק אחראי על ההתראה עצמה
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { symbol, direction, entryPrice, stopLoss } = body as {
    symbol?: string;
    direction?: string;
    entryPrice?: number;
    stopLoss?: number;
  };
  if (!symbol) return NextResponse.json({ error: 'חסר סימבול' }, { status: 400 });

  const dirLabel = direction === 'short' ? 'שורט' : 'לונג';

  await sendPushToActiveSubscribers({
    title: `🆕 עסקה חדשה בתיק - ${symbol}`,
    body: `${dirLabel}${entryPrice ? ` · כניסה: $${entryPrice}` : ''}${stopLoss ? ` · סטופ: $${stopLoss}` : ''}`,
    url: '/portfolio',
  });

  await sendPushToNonSubscribers({
    title: '🆕 עסקה חדשה נפתחה בתיק',
    body: 'הסימבול והפרטים גלויים למנויים - אפשר להצטרף ל-7 ימי ניסיון ללא עלות',
    url: '/trial',
  });

  return NextResponse.json({ ok: true });
}
