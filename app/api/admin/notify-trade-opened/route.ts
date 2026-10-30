import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { sendPushToActiveSubscribers } from '@/lib/webPush';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// POST - שולח התראת פוש לכל המנויים הפעילים שעסקה חדשה נפתחה בתיק. נקרא מה-client מיד אחרי
// שהעסקה נוספה בהצלחה דרך supabase ישירות (לא דרך ה-route הזה) - זה רק אחראי על ההתראה עצמה
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { symbol, direction } = body as { symbol?: string; direction?: string };
  if (!symbol) return NextResponse.json({ error: 'חסר סימבול' }, { status: 400 });

  const dirLabel = direction === 'short' ? 'שורט' : 'לונג';

  await sendPushToActiveSubscribers({
    title: `🆕 עסקה חדשה בתיק - ${symbol}`,
    body: `נפתחה עסקת ${dirLabel} ב-${symbol}`,
    url: '/portfolio',
  });

  return NextResponse.json({ ok: true });
}
