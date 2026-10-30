import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { isPhoneBlocked } from '@/lib/blockedContacts';
import { syncGenericLead } from '@/lib/tradingPlan/monday';

// POST - שומר מינוי להתראות פוש. שני מסלולים:
// 1) משתמש מחובר (יש טוקן תקין) - נשמר לפי user_id, בלי צורך בפרטי קשר (כבר יש פרופיל)
// 2) לא מחובר (ביקור אנונימי) - צריך שם+נייד, נוצר ליד במאנדיי בדיוק כמו טופס ליד רגיל באתר,
//    והמינוי נשמר עם user_id=null + פרטי הקשר - כדי שאפשר יהיה לשלוח גם למי שאינו מנוי
// upsert לפי endpoint - אם אותו מכשיר/דפדפן כבר רשום, רק מרעננים את השורה הקיימת
export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const body = await request.json().catch(() => ({}));
  const { endpoint, keys, name, phone, email } = body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    name?: string;
    phone?: string;
    email?: string;
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'חסרים פרטי מינוי' }, { status: 400 });
  }

  let userId: string | null = null;
  if (token) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user) userId = user.id;
  }

  if (userId) {
    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert({ user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, name: null, phone: null, email: null }, { onConflict: 'endpoint' });

    if (error) return NextResponse.json({ error: 'שגיאה בשמירת המינוי' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // מסלול לא-מחובר - שער הרשמה: צריך שם+נייד
  if (!name || !phone) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  if (await isPhoneBlocked(phone)) {
    return NextResponse.json({ ok: true });
  }

  await syncGenericLead({ phone, email: email || null, name, source: 'הפעלת התראות באתר (לא מנוי)' }).catch(() => ({ ok: false }));

  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .upsert({ user_id: null, endpoint, p256dh: keys.p256dh, auth: keys.auth, name, phone, email: email || null }, { onConflict: 'endpoint' });

  if (error) return NextResponse.json({ error: 'שגיאה בשמירת המינוי' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE - ביטול מינוי להתראות פוש (לפי endpoint של המכשיר הנוכחי) - עובד גם למי שלא מחובר
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');
  if (!endpoint) {
    return NextResponse.json({ error: 'חסר endpoint' }, { status: 400 });
  }

  await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', endpoint);
  return NextResponse.json({ ok: true });
}
