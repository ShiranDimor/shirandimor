import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { isPhoneBlocked } from '@/lib/blockedContacts';
import { normalizePhone, normalizeEmail } from '@/lib/subscriberStatus';
import { isContactInSubscribersGroupMonday, markAppDownloadOnMonday } from '@/lib/tradingPlan/monday';

// POST - שומר מינוי להתראות פוש. שלושה מסלולים:
// 1) משתמש מחובר (יש טוקן תקין) - נשמר לפי user_id, בלי צורך בפרטי קשר (כבר יש פרופיל)
// 2) לא מחובר, אבל שם+נייד/מייל תואמים למנוי פעיל קיים (לפי פרופיל באתר או קבוצת "סוחרים"
//    במאנדיי) - מזוהה כמנוי בלי לפתוח לו ליד, בדיוק כאילו היה מחובר
// 3) לא מחובר ולא מנוי - שער הרשמה: צריך שם+נייד, נפתח תמיד ליד חדש במאנדיי (מסומן "ליד כפול"
//    אם האיש קשר כבר קיים במקום כלשהו בלוח), והמינוי נשמר עם user_id=null + פרטי הקשר
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

  // מנוי פעיל שממלא את הטופס בלי להיות מחובר - מזהים לפי הפרופיל שלו באתר (טלפון/מייל מנורמלים,
  // כי הפורמט בטבלה לא בהכרח זהה לפורמט שהמשתמש הקליד), ומשייכים את המינוי ל-user_id האמיתי
  // שלו (בדיוק כמו מנוי מחובר) כדי שיקבל תוכן מלא בלי טשטוש, בלי לפתוח לו ליד
  const targetPhone = normalizePhone(phone);
  const targetEmail = normalizeEmail(email);
  const { data: activeProfiles } = await supabaseAdmin
    .from('profiles')
    .select('id, phone, email')
    .or('role.eq.admin,and(role.eq.subscriber,subscription_status.eq.active)');

  const matchedProfile = (activeProfiles || []).find(
    (p) => (targetPhone && normalizePhone(p.phone) === targetPhone) || (targetEmail && normalizeEmail(p.email) === targetEmail)
  );

  const isKnownSubscriber = !!matchedProfile || (await isContactInSubscribersGroupMonday(phone, email || null));

  if (isKnownSubscriber) {
    const subscriberUserId = matchedProfile?.id || null;
    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert(
        { user_id: subscriberUserId, endpoint, p256dh: keys.p256dh, auth: keys.auth, name: subscriberUserId ? null : name, phone: subscriberUserId ? null : phone, email: subscriberUserId ? null : (email || null) },
        { onConflict: 'endpoint' }
      );
    if (error) return NextResponse.json({ error: 'שגיאה בשמירת המינוי' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  await markAppDownloadOnMonday({ name, phone, email: email || null }).catch(() => ({ ok: false, matched: false }));

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
