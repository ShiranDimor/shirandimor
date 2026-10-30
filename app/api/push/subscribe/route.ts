import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

// POST - שומר מינוי להתראות פוש עבור המשתמש המחובר (אחרי שהדפדפן אישר הרשאה ונרשם ל-push).
// upsert לפי endpoint - אם אותו מכשיר/דפדפן כבר רשום, רק מרעננים את השורה הקיימת
export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: 'לא מחוברים' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { endpoint, keys } = body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'חסרים פרטי מינוי' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .upsert({ user_id: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'endpoint' });

  if (error) {
    return NextResponse.json({ error: 'שגיאה בשמירת המינוי' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE - ביטול מינוי להתראות פוש (לפי endpoint של המכשיר הנוכחי)
export async function DELETE(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: 'לא מחוברים' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');
  if (!endpoint) {
    return NextResponse.json({ error: 'חסר endpoint' }, { status: 400 });
  }

  await supabaseAdmin.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint);
  return NextResponse.json({ ok: true });
}
