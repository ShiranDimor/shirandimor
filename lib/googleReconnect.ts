// חיבור מחדש של יומן Google (כשההרשאה פגה): state חתום כדי שרק התחלה מעמוד האדמין תוביל להחלפת קוד בטוקן
import { createHmac, timingSafeEqual } from 'crypto';
import { env } from './googleCalendar';

export const GOOGLE_REDIRECT_PATH = '/api/admin/google-calendar/callback';

function secret() {
  return env('GOOGLE_CALENDAR_CLIENT_SECRET');
}

export function makeState() {
  const ts = Date.now().toString();
  return `${ts}.${createHmac('sha256', secret()).update(`gcal:${ts}`).digest('base64url')}`;
}

export function verifyState(state: string) {
  const [ts, sig] = state.split('.');
  if (!ts || !sig || !secret()) return false;
  if (Date.now() - Number(ts) > 15 * 60 * 1000) return false;
  const expected = Buffer.from(createHmac('sha256', secret()).update(`gcal:${ts}`).digest('base64url'));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function redirectUri(requestUrl: string) {
  return new URL(GOOGLE_REDIRECT_PATH, new URL(requestUrl).origin).toString();
}
