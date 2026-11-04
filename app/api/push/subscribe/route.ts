import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { isPhoneBlocked } from '@/lib/blockedContacts';
import { normalizePhone, normalizeEmail } from '@/lib/subscriberStatus';
import { entitlementOrFilter } from '@/lib/entitlement';
import { isContactInSubscribersGroupMonday, markAppDownloadOnMonday } from '@/lib/tradingPlan/monday';

// שומר את תוצאת סנכרון מאנדיי (שגיאה, אם הייתה) על שורת המינוי - בלי זה כישלון סנכרון היה
// שקוף לגמרי: הפעלת ההתראות עצמה עדיין מצליחה (ok:true ללקוח) אבל אין שום עקבה שהעדכון
// במאנדיי נכשל, עד שמישהו שם לב ידנית שהעמודה לא התעדכנה
async function recordMondaySyncResult(endpoint: string, result: { ok: boolean; error?: string }) {
  if (result.ok) return;
  try {
    await supabaseAdmin.from('push_subscriptions').update({ monday_sync_error: result.error || 'unknown_error' }).eq('endpoint', endpoint);
  } catch (e) {
    // best-effort בלבד - לא חוסם את תגובת ה-API למשתמש
  }
}

// POST - שומר מינוי להתראות פוש. שלושה מסלולים, ובכל אחד מהם מסמנים גם במאנדיי (עמודת "סטטוס
// טיפול") שאיש הקשר הפעיל התראות - על הכרטיס הקיים שלו אם יש לו אחד במקום כלשהו בלוח, או בכרטיס
// חדש אם אין לו שום כרטיס קיים (ר' markAppDownloadOnMonday):
// 1) משתמש מחובר (יש טוקן תקין) - נשמר לפי user_id, מסמנים לפי הטלפון/מייל שבפרופיל שלו
// 2) לא מחובר, אבל שם+נייד/מייל תואמים למנוי פעיל קיים (לפי פרופיל באתר או קבוצת "סוחרים"
//    במאנדיי) - מזוהה כמנוי בלי לפתוח לו ליד, בדיוק כאילו היה מחובר
// 3) לא מחובר ולא מנוי - שער הרשמה: צריך שם+נייד, והמינוי נשמר עם user_id=null + פרטי הקשר
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
    // מנקים invalid_at/invalid_reason - אם זה היה endpoint שסומן כלא-תקף (ר' lib/webPush.ts),
    // ה-upsert הזה עצמו הוא ההוכחה הכי טובה שההרשמה חזרה להיות תקפה
    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert({ user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, name: null, phone: null, email: null, invalid_at: null, invalid_reason: null }, { onConflict: 'endpoint' });

    if (error) return NextResponse.json({ error: 'שגיאה בשמירת המינוי' }, { status: 500 });

    const { data: profile } = await supabaseAdmin.from('profiles').select('full_name, phone, email').eq('id', userId).maybeSingle();
    const mondayResult = await markAppDownloadOnMonday({ name: profile?.full_name, phone: profile?.phone, email: profile?.email }).catch((e) => ({ ok: false, matched: false, error: e instanceof Error ? e.message : 'threw' }));
    await recordMondaySyncResult(endpoint, mondayResult);

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
    .or(entitlementOrFilter());

  const matchedProfile = (activeProfiles || []).find(
    (p) => (targetPhone && normalizePhone(p.phone) === targetPhone) || (targetEmail && normalizeEmail(p.email) === targetEmail)
  );

  const isKnownSubscriber = !!matchedProfile || (await isContactInSubscribersGroupMonday(phone, email || null));

  if (isKnownSubscriber) {
    const subscriberUserId = matchedProfile?.id || null;
    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert(
        { user_id: subscriberUserId, endpoint, p256dh: keys.p256dh, auth: keys.auth, name: subscriberUserId ? null : name, phone: subscriberUserId ? null : phone, email: subscriberUserId ? null : (email || null), invalid_at: null, invalid_reason: null },
        { onConflict: 'endpoint' }
      );
    if (error) return NextResponse.json({ error: 'שגיאה בשמירת המינוי' }, { status: 500 });

    const mondayResult = await markAppDownloadOnMonday({ name, phone, email: email || null }).catch((e) => ({ ok: false, matched: false, error: e instanceof Error ? e.message : 'threw' }));
    await recordMondaySyncResult(endpoint, mondayResult);

    return NextResponse.json({ ok: true });
  }

  const mondayResultLead = await markAppDownloadOnMonday({ name, phone, email: email || null }).catch((e) => ({ ok: false, matched: false, error: e instanceof Error ? e.message : 'threw' }));

  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .upsert({ user_id: null, endpoint, p256dh: keys.p256dh, auth: keys.auth, name, phone, email: email || null, monday_sync_error: mondayResultLead.ok ? null : (mondayResultLead.error || 'unknown_error'), invalid_at: null, invalid_reason: null }, { onConflict: 'endpoint' });

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
