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

// POST - שולח התראת פוש שעסקה פתוחה עודכנה (סטופ, יעד רווח, מחיר כניסה, עד-איזה-מחיר-להיכנס
// - כל שינוי בפרמטרים של עסקה פתוחה, לא רק סטופ לוס כמו שהיה פעם) - גם למנויים (עם הסימבול
// והפירוט המלא) וגם ללא-מנויים (מטושטש), בדיוק כמו כל עדכון אחר
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { symbol, changes } = body as { symbol?: string; changes?: string[] };
  if (!symbol || !Array.isArray(changes) || changes.length === 0) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  await sendPushToActiveSubscribers({
    title: `🔁 עדכון בעסקה פתוחה - ${symbol}`,
    body: `${changes.join(' · ')} · ⚠️ לא ייעוץ/המלצה`,
    url: '/portfolio',
  }, 'trade');

  await sendPushToNonSubscribers({
    title: '🔁 עדכון בעסקה פתוחה',
    body: 'הסימבול והפרטים גלויים למנויים - חודש ראשון ב-₪1 ←',
    url: '/subscribe',
  }, 'trade');

  return NextResponse.json({ ok: true });
}
