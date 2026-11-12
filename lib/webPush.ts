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

type SubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string; user_id?: string | null; phone?: string | null; email?: string | null };

export type SendResult = { configured: boolean; attempted: number; sent: number; failed: number; removedStale: number };

// מיוצא - גם push-health-check (app/api/cron/push-health-check) צריך לזהות "אותו איש קשר"
// בין כמה שורות מינוי, כדי לא להתריע על מישהו ששורה אחת שלו נשברה אבל יש לו מכשיר אחר שעדיין תקף
export function normalizePhone(raw: string | null | undefined): string {
  return (raw || '').replace(/\D/g, '').slice(-9);
}

export function normalizeEmail(raw: string | null | undefined): string {
  return (raw || '').trim().toLowerCase();
}

// מזהה "איש קשר" אחד - לא מכשיר אחד. מנוי/ה עם כמה מכשירים (טלפון + לפטופ) הוא עדיין אדם
// אחד; שירן ביקשה מפורשות שהמספרים יספרו אנשים ("נשלח ל-47" כשיש 47 מנויים), לא שורות
// מכשיר שעלולות לספור את אותו אדם פעמיים
function recipientKey(row: SubscriptionRow): string {
  if (row.user_id) return `u:${row.user_id}`;
  return `c:${normalizePhone(row.phone)}|${normalizeEmail(row.email)}`;
}

// רישום לטבלת "יומן התראות" - מקור האמת היחיד למרכז ההתראות (הפעמון) באתר, כדי שההיסטוריה
// שמוצגת שם תהיה תמיד בדיוק מה שבאמת נשלח כהתראת פוש, כולל הניסוח המדויק לכל קהל (למנויים
// עם הסימבול, ללא-מנויים בגרסה מטושטשת) - בלי לשחזר את זה בדיעבד מכמה טבלאות שונות.
// sourceId (כשיש) הוא ה-id של השורה המקורית (שיעור/לייב/מודעה) - כדי שמחיקת הפריט המקורי
// תוכל למחוק גם את רשומת היומן המתאימה, ולא תישאר "רפאים" בפעמון אחרי שהתוכן כבר לא קיים
export type NotificationAudience = 'subscribers' | 'non_subscribers' | 'everyone' | 'admin';

async function logNotification(kind: NotificationKind, audience: NotificationAudience, payload: PushPayload, sourceId?: string): Promise<string | null> {
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
// ספירה לפי אדם, לא לפי מכשיר - אם יש לאיש קשר כמה מכשירים, הוא "נשלח" אם לפחות אחד הצליח
// (קיבל בפועל), "נכשל" רק אם אף אחד מהמכשירים שלו לא הצליח אבל לפחות אחד נכשל עם שגיאה
// אמיתית (לא 404/410), ו"הוסר" רק אם כל המכשירים שלו כבר לא תקפים - כלומר אין לו שום דרך
// לקבל פוש יותר, לא רק שמכשיר ישן אחד מתוך כמה נפל
function summarizeByRecipient(rows: SubscriptionRow[], outcomes: Map<string, 'sent' | 'failed' | 'stale'>): SendResult {
  const byRecipient = new Map<string, ('sent' | 'failed' | 'stale')[]>();
  for (const row of rows) {
    const key = recipientKey(row);
    const outcome = outcomes.get(row.id);
    if (!outcome) continue;
    const list = byRecipient.get(key) || [];
    list.push(outcome);
    byRecipient.set(key, list);
  }

  let sent = 0;
  let failed = 0;
  let removedStale = 0;
  for (const deviceOutcomes of byRecipient.values()) {
    if (deviceOutcomes.includes('sent')) sent++;
    else if (deviceOutcomes.includes('failed')) failed++;
    else removedStale++;
  }

  return { configured: true, attempted: byRecipient.size, sent, failed, removedStale };
}

async function sendToRows(rows: SubscriptionRow[], payload: PushPayload): Promise<SendResult> {
  if (!ensureConfigured()) return { configured: false, attempted: rows.length, sent: 0, failed: 0, removedStale: 0 };
  if (rows.length === 0) return { configured: true, attempted: 0, sent: 0, failed: 0, removedStale: 0 };

  const outcomes = new Map<string, 'sent' | 'failed' | 'stale'>();

  await Promise.all(
    rows.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
        outcomes.set(sub.id, 'sent');
      } catch (e: unknown) {
        const statusCode = (e as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabaseAdmin.from('push_subscriptions').update({ invalid_at: new Date().toISOString(), invalid_reason: `http_${statusCode}` }).eq('id', sub.id);
          outcomes.set(sub.id, 'stale');
        } else {
          console.error('שגיאה בשליחת התראת פוש', e);
          outcomes.set(sub.id, 'failed');
        }
      }
    })
  );

  return summarizeByRecipient(rows, outcomes);
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<SendResult> {
  const { data: subs } = await supabaseAdmin.from('push_subscriptions').select('id, endpoint, p256dh, auth, user_id').eq('user_id', userId).is('invalid_at', null);
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
  const { data: subs } = await supabaseAdmin.from('push_subscriptions').select('id, endpoint, p256dh, auth, user_id').in('user_id', ids).is('invalid_at', null);
  const result = await sendToRows(subs || [], { ...payload, kind, logId: logId || undefined });
  await recordSendResult(logId, result);
  return result;
}

// שולח לכל מי שאינו מנוי פעיל כרגע - גם לידים בלי חשבון בכלל (user_id null, נרשמו דרך שער
// ההרשמה), וגם למי שכן מחובר עם חשבון אבל אינו מנוי פעיל (למשל מנוי שפג)
export async function sendPushToNonSubscribers(payload: PushPayload, kind: NotificationKind, sourceId?: string): Promise<SendResult> {
  const logId = await logNotification(kind, 'non_subscribers', payload, sourceId);
  const subscriberIds = await getActiveSubscriberUserIds();
  const query = supabaseAdmin.from('push_subscriptions').select('id, endpoint, p256dh, auth, user_id, phone, email').is('invalid_at', null);
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
  const { data: rows } = await supabaseAdmin.from('push_subscriptions').select('id, endpoint, p256dh, auth, user_id, phone, email').is('invalid_at', null);
  const result = await sendToRows(rows || [], { ...payload, kind, logId: logId || undefined });
  await recordSendResult(logId, result);
  return result;
}

// שולח התראות מערכת פנימיות (כמו בדיקת-תקינות-פוש) לשירן/אדמינים אחרים - עם רישום ביומן
// ההתראות (notification_log), כדי שזה יופיע ב-/admin/notifications ולא רק כפוש חולף בטלפון
// שאפשר לפספס/למחוק ולאבד לצמיתות
export async function sendPushToAdmins(payload: PushPayload, kind: NotificationKind, sourceId?: string): Promise<SendResult> {
  const logId = await logNotification(kind, 'admin', payload, sourceId);
  const { data: admins } = await supabaseAdmin.from('profiles').select('id').eq('role', 'admin');
  const adminIds = (admins || []).map((a) => a.id);
  const { data: rows } = adminIds.length
    ? await supabaseAdmin.from('push_subscriptions').select('id, endpoint, p256dh, auth, user_id').in('user_id', adminIds).is('invalid_at', null)
    : { data: [] as SubscriptionRow[] };
  const result = await sendToRows(rows || [], { ...payload, kind, logId: logId || undefined });
  await recordSendResult(logId, result);
  return result;
}
