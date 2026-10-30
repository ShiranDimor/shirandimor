import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/instantLogin';

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

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

// שולח התראת פוש לכל המכשירים הרשומים של משתמש אחד. מוחק אוטומטית מינויים שפגו (410/404 -
// המשתמש ביטל הרשאה או הסיר את האתר ממסך הבית) כדי שלא ננסה לשלוח אליהם שוב בכל פעם
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!ensureConfigured()) return;

  const { data: subs } = await supabaseAdmin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId);
  if (!subs || subs.length === 0) return;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (e: unknown) {
        const statusCode = (e as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error('שגיאה בשליחת התראת פוש', e);
        }
      }
    })
  );
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  await Promise.all(userIds.map((id) => sendPushToUser(id, payload)));
}

// שולח התראת פוש לכל המנויים הפעילים (ולשירן עצמה) - ל-user_id-ים, לא טלפון/מייל, כי
// push_subscriptions מקושר למשתמש מחובר ולא לפרטי קשר
export async function sendPushToActiveSubscribers(payload: PushPayload) {
  const { data: rows } = await supabaseAdmin.from('profiles').select('id').or('role.eq.admin,and(role.eq.subscriber,subscription_status.eq.active)');
  if (!rows || rows.length === 0) return;
  await sendPushToUsers(rows.map((r) => r.id), payload);
}
