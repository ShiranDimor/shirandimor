// קישור אישי לשינוי מועד / ביטול של שיחת התאמה שנקבעה מהאתר. הקישור כולל את מזהה האירוע ביומן וחתימה
// (HMAC) - כך שרק מי שקיבל/ה את הקישור (במסך האישור או בזימון ליומן) יכול/ה לשנות את השיחה שלו/ה, ולא של אחרים.
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { MENTORING_PAGE_URL } from './mentoringLead';
import { env } from './googleCalendar';

// סוד לחתימה: משתנה ייעודי אם הוגדר, ואחרת הסוד של חיבור היומן (קיים ממילא בכל סביבה שבה היומן עובד)
function secret() {
  return process.env.CALL_MANAGE_SECRET || env('GOOGLE_CALENDAR_CLIENT_SECRET');
}

// מזהה אירוע לפי חוקי Google Calendar: אותיות a-v וספרות בלבד
const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuv';
export function newCallEventId() {
  return 'mt' + Array.from(randomBytes(24), (b) => ID_ALPHABET[b % 32]).join('');
}

export function isValidCallEventId(id: string) {
  return /^[a-v0-9]{5,100}$/.test(id);
}

export function signCallEventId(id: string) {
  return createHmac('sha256', secret()).update(`mentoring-call:${id}`).digest('base64url').slice(0, 32);
}

export function verifyCallToken(id: string, token: string) {
  if (!secret() || !isValidCallEventId(id) || !token) return false;
  const expected = Buffer.from(signCallEventId(id));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function callManageUrl(id: string) {
  return `${MENTORING_PAGE_URL}/manage?e=${id}&t=${signCallEventId(id)}`;
}
