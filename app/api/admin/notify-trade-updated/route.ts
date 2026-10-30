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

// POST - שולח התראת פוש שהסטופ לוס של עסקה פתוחה עודכן - גם למנויים (עם הסימבול) וגם ללא-
// מנויים (מטושטש), בדיוק כמו כל עדכון אחר בעסקה פתוחה - אין יותר הבדל בין סוגי ההתראות עצמן,
// רק בחשיפת הסימבול בעסקאות פתוחות
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { symbol, newStopLoss } = body as { symbol?: string; newStopLoss?: number };
  if (!symbol || typeof newStopLoss !== 'number') {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  await sendPushToActiveSubscribers({
    title: `🔁 סטופ לוס עודכן - ${symbol}`,
    body: `הסטופ החדש: $${newStopLoss}`,
    url: '/portfolio',
  });

  await sendPushToNonSubscribers({
    title: '🔁 סטופ לוס עודכן בעסקה פתוחה',
    body: 'הסימבול גלוי למנויים - ל-7 ימי ניסיון ללא עלות ←',
    url: '/trial',
  });

  return NextResponse.json({ ok: true });
}
