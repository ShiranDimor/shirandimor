import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { isPhoneBlocked } from '@/lib/blockedContacts';
import { normalizePhone, normalizeEmail } from '@/lib/subscriberStatus';
import { entitlementOrFilter } from '@/lib/entitlement';
import { isContactInSubscribersGroupMonday, markAppDownloadOnMonday, markPushDisabledOnMonday } from '@/lib/tradingPlan/monday';
import { startSequence } from '@/lib/sequenceEngine';

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

// האם יש כבר תוקף ל-endpoint הזה (לא פג) - אם כן, אין טעם לסנכרן שוב מול מאנדיי: markAppDownloadOnMonday
// עצמה סורקת את כל הלוח בעמוד-אחר-עמוד (findItemIdByContactAnywhere) בכל קריאה, וזה נקרא בעבר
// בכל טעינת עמוד אצל כל מי שכבר יש לו מינוי פעיל (checkStatus -> resyncSubscriptionToServer),
// לא רק בהרשמה חדשה - מה שהציף את מאנדיי בבקשות וגרם לקצב-הגבלה (rate limit) שחוזר כ-HTML
// במקום JSON ("<!doctype html...") - בדיוק השגיאה שראינו בפועל על רוב השורות. עכשיו מסנכרנים
// מול מאנדיי רק כשזה באמת חדש (endpoint לא קיים) או חוזר מ"לא תקף" ל"תקף"
async function isNewOrReactivatedEndpoint(endpoint: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('push_subscriptions').select('invalid_at').eq('endpoint', endpoint).maybeSingle();
  return !data || data.invalid_at !== null;
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
    // בודקים *לפני* ה-upsert אם זה endpoint חדש/לא-תקף - אחרי ה-upsert invalid_at תמיד יהיה
    // null (זה בדיוק מה שה-upsert עושה) ולא נדע עוד להבדיל "היה כבר תקף" מ"הפך עכשיו לתקף"
    const shouldSyncMonday = await isNewOrReactivatedEndpoint(endpoint);

    // מנקים invalid_at/invalid_reason - אם זה היה endpoint שסומן כלא-תקף (ר' lib/webPush.ts),
    // ה-upsert הזה עצמו הוא ההוכחה הכי טובה שההרשמה חזרה להיות תקפה
    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert({ user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, name: null, phone: null, email: null, invalid_at: null, invalid_reason: null }, { onConflict: 'endpoint' });

    if (error) return NextResponse.json({ error: 'שגיאה בשמירת המינוי' }, { status: 500 });

    if (shouldSyncMonday) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('full_name, phone, email').eq('id', userId).maybeSingle();
      const mondayResult = await markAppDownloadOnMonday({ name: profile?.full_name, phone: profile?.phone, email: profile?.email }).catch((e) => ({ ok: false, matched: false, skippedFullAccess: false, error: e instanceof Error ? e.message : 'threw' }));
      await recordMondaySyncResult(endpoint, mondayResult);
      // לא מנוי/ה (markAppDownloadOnMonday עצמה כבר בדקה את זה) - זו בדיוק ההפעלה-ללא-מנוי
      // שרצף הטיפוח (lib/sequenceEngine.ts) מיועד לה
      if (mondayResult.ok && !mondayResult.skippedFullAccess) {
        await startSequence('nurture-push-no-sub', { userId }).catch((e) => console.error('push/subscribe: נכשלה התחלת רצף הטיפוח (מחובר/ת)', e));
      }
    }

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

  const shouldSyncMonday = await isNewOrReactivatedEndpoint(endpoint);

  if (isKnownSubscriber) {
    const subscriberUserId = matchedProfile?.id || null;
    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert(
        { user_id: subscriberUserId, endpoint, p256dh: keys.p256dh, auth: keys.auth, name: subscriberUserId ? null : name, phone: subscriberUserId ? null : phone, email: subscriberUserId ? null : (email || null), invalid_at: null, invalid_reason: null },
        { onConflict: 'endpoint' }
      );
    if (error) return NextResponse.json({ error: 'שגיאה בשמירת המינוי' }, { status: 500 });

    if (shouldSyncMonday) {
      const mondayResult = await markAppDownloadOnMonday({ name, phone, email: email || null }).catch((e) => ({ ok: false, matched: false, skippedFullAccess: false, error: e instanceof Error ? e.message : 'threw' }));
      await recordMondaySyncResult(endpoint, mondayResult);
    }

    return NextResponse.json({ ok: true });
  }

  // ליד חדש (לא מנוי, לא מחובר) - זו בדיוק נקודת הכניסה שצריכה תמיד לפתוח/לעדכן כרטיס במאנדיי,
  // בלי קשר ל-shouldSyncMonday (ליד אמיתי חדש הוא כמעט תמיד גם endpoint חדש, אבל גם אם לא -
  // עדיף לסנכרן יתר על המידה כאן מאשר לפספס ליד אמיתי)
  const mondayResultLead = await markAppDownloadOnMonday({ name, phone, email: email || null }).catch((e) => ({ ok: false, matched: false, skippedFullAccess: false, error: e instanceof Error ? e.message : 'threw' }));

  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .upsert({ user_id: null, endpoint, p256dh: keys.p256dh, auth: keys.auth, name, phone, email: email || null, monday_sync_error: mondayResultLead.ok ? null : (mondayResultLead.error || 'unknown_error'), invalid_at: null, invalid_reason: null }, { onConflict: 'endpoint' });

  if (error) return NextResponse.json({ error: 'שגיאה בשמירת המינוי' }, { status: 500 });

  if (mondayResultLead.ok && !mondayResultLead.skippedFullAccess) {
    await startSequence('nurture-push-no-sub', { phone, email: email || null }).catch((e) => console.error('push/subscribe: נכשלה התחלת רצף הטיפוח (ליד)', e));
  }

  return NextResponse.json({ ok: true });
}

// DELETE - ביטול מינוי להתראות פוש (לפי endpoint של המכשיר הנוכחי) - עובד גם למי שלא מחובר
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');
  if (!endpoint) {
    return NextResponse.json({ error: 'חסר endpoint' }, { status: 400 });
  }

  const { data: row } = await supabaseAdmin.from('push_subscriptions').select('user_id, phone, email').eq('endpoint', endpoint).maybeSingle();

  await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', endpoint);

  // אם זה היה המכשיר התקף האחרון של איש הקשר הזה (לא נשאר לו/ה שום דרך אחרת לקבל פוש) -
  // מעדכנים את מאנדיי שהוא/היא כיבה/תה בפועל את ההתראות (ר' markPushDisabledOnMonday).
  // אם יש עוד מכשיר תקף (למשל נייד+לפטופ) - לא נוגעים במאנדיי, כי עדיין אפשר להגיע אליו/ה
  if (row) {
    let stillReachable: boolean;
    let phone = row.phone;
    let email = row.email;

    if (row.user_id) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('phone, email').eq('id', row.user_id).maybeSingle();
      phone = profile?.phone || phone;
      email = profile?.email || email;
      const { count } = await supabaseAdmin.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', row.user_id).is('invalid_at', null);
      stillReachable = Boolean(count && count > 0);
    } else {
      const targetPhone = normalizePhone(phone);
      const targetEmail = normalizeEmail(email);
      const { data: remaining } = await supabaseAdmin.from('push_subscriptions').select('phone, email').is('user_id', null).is('invalid_at', null);
      stillReachable = (remaining || []).some((r) => (!!targetPhone && normalizePhone(r.phone) === targetPhone) || (!!targetEmail && normalizeEmail(r.email) === targetEmail));
    }

    if (!stillReachable && (phone || email)) {
      await markPushDisabledOnMonday({ phone, email }).catch((e) => console.error('push/subscribe DELETE: נכשל עדכון מאנדיי על כיבוי התראות', e));
    }
  }

  return NextResponse.json({ ok: true });
}
