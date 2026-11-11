import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/instantLogin';
import { entitlementOrFilter } from '@/lib/entitlement';

// שליחת התראות פוש אמיתיות לטלפון/דפדפן, במקביל למייל - מצריך שהמשתמש אישר התראות
// ו"התקין" את האתר למסך הבית (בעיקר באייפון). מפתחות VAPID מזהים את השרת שלנו מול
// שירותי הפוש של כל דפדפן (Chrome/Firefox/Safari) - בלי קשר לשירות חיצוני כמו Firebase
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails('mailto:shiran@shirandimor.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

export type NotificationKind = 'trade' | 'lesson' | 'live' | 'announcement';

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  // מועבר בפועל בתוך גוף ה-push (לא רק לתיעוד הפנימי ב-notification_log) - כדי שה-Service
  // Worker (public/sw.js) יוכל להבדיל התראת עסקה מכל שאר הסוגים ולתת לה רטט/עדיפות משלה.
  // לא מוגדר כשקוראים ל-sendPushToUser/sendPushToUsers הישירים (בדיקה-לעצמי, אדמין) - רק
  // sendPushToActiveSubscribers/NonSubscribers/Everyone ממלאים אותו אוטומטית מה-kind שהן מקבלות
  kind?: NotificationKind;
  // מזהה רשומת notification_log - מועבר בפועל בתוך גוף ה-push כדי שה-Service Worker יוכל
  // "לאשר קבלה" בחזרה (POST ל-/api/push/receipt) ברגע שההתראה באמת הוצגה במכשיר, לא רק
  // שהשירות של גוגל/אפל הסכים לקבל אותה לשליחה. ר' sendPushToActiveSubscribers/NonSubscribers/
  // Everyone - הן היחידות שממלאות את זה (יש להן logId אמיתי מ-logNotification)
  logId?: string;
};

type SubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };

export type SendResult = { configured: boolean; attempted: number; sent: number; failed: number; removedStale: number };

// רישום לטבלת "יומן התראות" - מקור האמת היחיד למרכז ההתראות (הפעמון) באתר, כדי שההיסטוריה
// שמוצגת שם תהיה תמיד בדיוק מה שבאמת נשלח כהתראת פוש, כולל הניסוח המדויק לכל קהל (למנויים
// עם הסימבול, ללא-מנויים בגרסה מטושטשת) - בלי לשחזר את זה בדיעבד מכמה טבלאות שונות.
// sourceId (כשיש) הוא ה-id של השורה המקורית (שיעור/לייב/מודעה) - כדי שמחיקת הפריט המקורי
// תוכל למחוק גם את רשומת היומן המתאימה, ולא תישאר "רפאים" בפעמון אחרי שהתוכן כבר לא קיים
async function logNotification(kind: NotificationKind, audience: 'subscribers' | 'non_subscribers' | 'everyone', payload: PushPayload, sourceId?: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('notification_log')
    .insert({ kind, audience, title: payload.title, body: payload.body, url: payload.url || null, source_id: sourceId || null })
    .select('id')
    .single();
  return data?.id || null;
}

// מעדכן את אותה רשומת יומן עם מה שבאמת קרה בשליחה בפועל (sent/failed/removedStale) - בלי זה
// יומן ההתראות מראה רק "ניסינו לשלוח", ואין שום דרך לדעת בדיעבד אם זה באמת הגיע למישהו
async function recordSendResult(logId: string | null, result: SendResult) {
  if (!logId) return;
  await supabaseAdmin
    .from('notification_log')
    .update({ configured: result.configured, sent_count: result.sent, failed_count: result.failed, removed_stale_count: result.removedStale })
    .eq('id', logId);
}

// שולח לרשימת שורות מינוי גולמית (לא לפי user_id - כך גם לידים בלי חשבון, ששורת המינוי שלהם
// user_id=null, מקבלים התראות). מינוי שפג (404/410 - המשתמש ביטל הרשאה או הסיר את האתר ממסך
// הבית) מסומן invalid_at/invalid_reason במקום להימחק - כדי שלא ננסה לשלוח אליו שוב (השורות
// שנשלפות ל-sendToRows כבר מסוננות invalid_at is null), אבל גם כדי שיישאר תיעוד של מתי וזה
// קרה במקום שהרשומה פשוט "תיעלם" בלי עקבות. resubscribe אמיתי (POST ל-/api/push/subscribe)
// מנקה את הסימון חזרה. מחזיר סיכום אמיתי של מה שקרה בפועל (configured/attempted/sent/failed/
// removedStale) - כדי שבדיקה-לעצמי תוכל לדווח משהו אמיתי במקום "ok" גורף גם כשבפועל לא נשלח כלום
async function sendToRows(rows: SubscriptionRow[], payload: PushPayload): Promise<SendResult> {
  if (!ensureConfigured()) return { configured: false, attempted: rows.length, sent: 0, failed: 0, removedStale: 0 };
  if (rows.length === 0) return { configured: true, attempted: 0, sent: 0, failed: 0, removedStale: 0 };

  let sent = 0;
  let failed = 0;
  let removedStale = 0;

  await Promise.all(
    rows.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
        sent++;
      } catch (e: unknown) {
        const statusCode = (e as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabaseAdmin.from('push_subscriptions').update({ invalid_at: new Date().toISOString(), invalid_reason: `http_${statusCode}` }).eq('id', sub.id);
          removedStale++;
        } else {
          console.error('שגיאה בשליחת התראת פוש', e);
          failed++;
        }
      }
    })
  );

  return { configured: true, attempted: rows.length, sent, failed, removedStale };
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<SendResult> {
  const { data: subs } = await supabaseAdmin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId).is('invalid_at', null);
  return sendToRows(subs || [], payload);
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  await Promise.all(userIds.map((id) => sendPushToUser(id, payload)));
}

async function getActiveSubscriberUserIds(): Promise<string[]> {
  const { data: rows } = await supabaseAdmin.from('profiles').select('id').or(entitlementOrFilter());
  return (rows || []).map((r) => r.id);
}

// שולח התראת פוש לכל המנויים הפעילים (ולשירן עצמה) - לכל מי שה-user_id שלו שייך למנוי פעיל/אדמין
export async function sendPushToActiveSubscribers(payload: PushPayload, kind: NotificationKind, sourceId?: string): Promise<SendResult> {
  const logId = await logNotification(kind, 'subscribers', payload, sourceId);
  const ids = await getActiveSubscriberUserIds();
  if (ids.length === 0) {
    const result: SendResult = { configured: true, attempted: 0, sent: 0, failed: 0, removedStale: 0 };
    await recordSendResult(logId, result);
    return result;
  }
  const { data: subs } = await supabaseAdmin.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('user_id', ids).is('invalid_at', null);
  const result = await sendToRows(subs || [], { ...payload, kind, logId: logId || undefined });
  await recordSendResult(logId, result);
  return result;
}

// שולח לכל מי שאינו מנוי פעיל כרגע - גם לידים בלי חשבון בכלל (user_id null, נרשמו דרך שער
// ההרשמה), וגם למי שכן מחובר עם חשבון אבל אינו מנוי פעיל (למשל מנוי שפג)
export async function sendPushToNonSubscribers(payload: PushPayload, kind: NotificationKind, sourceId?: string): Promise<SendResult> {
  const logId = await logNotification(kind, 'non_subscribers', payload, sourceId);
  const subscriberIds = await getActiveSubscriberUserIds();
  const query = supabaseAdmin.from('push_subscriptions').select('id, endpoint, p256dh, auth, user_id').is('invalid_at', null);
  const { data: allSubs } = await query;
  const rows = (allSubs || []).filter((s) => !s.user_id || !subscriberIds.includes(s.user_id));
  const result = await sendToRows(rows, { ...payload, kind, logId: logId || undefined });
  await recordSendResult(logId, result);
  return result;
}

// שולח ללא יוצא מן הכלל - גם מנויים וגם לא-מנויים (לשימוש בהתראות שרוצים שכולם יראו, כמו
// עסקה שנסגרה)
export async function sendPushToEveryone(payload: PushPayload, kind: NotificationKind, sourceId?: string): Promise<SendResult> {
  const logId = await logNotification(kind, 'everyone', payload, sourceId);
  const { data: rows } = await supabaseAdmin.from('push_subscriptions').select('id, endpoint, p256dh, auth').is('invalid_at', null);
  const result = await sendToRows(rows || [], { ...payload, kind, logId: logId || undefined });
  await recordSendResult(logId, result);
  return result;
}
