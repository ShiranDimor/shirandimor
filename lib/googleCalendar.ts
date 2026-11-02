// יצירת אירוע ביומן Google של שירן (כולל קישור Google Meet) בכל פעם שנוצר לייב חדש - דרך חשבון
// שמחובר פעם אחת מראש (OAuth), לא תלוי בכל משתמש/מבקר באתר. אם המשתנים לא מוגדרים בסביבה,
// הפונקציה פשוט לא עושה כלום - יצירת הלייב עצמה לא נכשלת בגלל זה.
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const DEFAULT_DURATION_MINUTES = 60;

// קורא משתנה סביבה ומנקה רווחים ומירכאות שנכנסו בטעות בהדבקה (למשל מתוך קובץ JSON)
export function env(name: string) {
  const raw = (process.env[name] || '').trim();
  // הודבק בטעות כל קובץ ה-JSON שהורד מגוגל - מחלצים ממנו את הערך הנכון
  if (raw.startsWith('{')) {
    try {
      const j = JSON.parse(raw);
      const c = j.web || j.installed || j;
      if (name.endsWith('CLIENT_SECRET') && c.client_secret) return String(c.client_secret).trim();
      if (name.endsWith('CLIENT_ID') && c.client_id) return String(c.client_id).trim();
    } catch {}
  }
  return raw.replace(/^["']+|["']+$/g, '').trim();
}

async function getAccessToken(): Promise<string | null> {
  const clientId = env('GOOGLE_CALENDAR_CLIENT_ID');
  const clientSecret = env('GOOGLE_CALENDAR_CLIENT_SECRET');
  const refreshToken = env('GOOGLE_CALENDAR_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) {
      console.error('שגיאה בחידוש טוקן ליומן Google', await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    return data.access_token || null;
  } catch (e) {
    console.error('שגיאה בחידוש טוקן ליומן Google', e);
    return null;
  }
}

// יוצר אירוע ביומן הראשי של החשבון המחובר, עם קישור Google Meet אוטומטי. מחזיר את קישור ה-Meet,
// או null אם החיבור לא מוגדר או שהיצירה נכשלה
export async function createLiveCalendarEvent(
  title: string,
  description: string | null,
  scheduledAtIso: string,
  liveId: string
): Promise<string | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  try {
    const start = new Date(scheduledAtIso);
    const end = new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);

    const res = await fetch(`${EVENTS_URL}?conferenceDataVersion=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        summary: `${title} - עם שירן דימור, מדברים עסקאות`,
        description: description || undefined,
        start: { dateTime: start.toISOString(), timeZone: 'Asia/Jerusalem' },
        end: { dateTime: end.toISOString(), timeZone: 'Asia/Jerusalem' },
        conferenceData: {
          createRequest: {
            requestId: liveId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    });

    if (!res.ok) {
      console.error('שגיאה ביצירת אירוע ביומן Google', await res.text().catch(() => ''));
      return null;
    }

    const data = await res.json();
    const meetLink =
      data.hangoutLink ||
      (data.conferenceData?.entryPoints || []).find((e: { entryPointType: string }) => e.entryPointType === 'video')?.uri;

    return meetLink || null;
  } catch (e) {
    console.error('שגיאה ביצירת אירוע ביומן Google', e);
    return null;
  }
}

// ===== שיחות התאמה מהעמוד לארגונים =====

export type BusyInterval = { start: number; end: number };

// סימון פנימי על אירועי שיחות שנקבעו מהעמוד, כדי לזהות אותם ביומן
const FIT_CALL_TAG = 'businessFitCall';
// אירועים שנקבעו לפני שהסימון נוסף - מזוהים לפי תחילת הכותרת
const LEGACY_FIT_CALL_PREFIX = 'שיחת התאמה:';

// מחזיר את הזמנים של שיחות שכבר נקבעו מהעמוד לארגונים (באלפיות שנייה). שאר האירועים ביומן (אישיים, לייבים
// וכו') לא חוסמים קביעת שיחה - בכוונה, לבקשת שירן. מתעלם משיחות שבוטלו. מחזיר null אם החיבור לא מוגדר
// או שהקריאה נכשלה.
export async function listBookedCallIntervals(timeMin: Date, timeMax: Date): Promise<BusyInterval[] | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  const busy: BusyInterval[] = [];
  let pageToken: string | undefined;
  try {
    do {
      const params = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
        fields: 'nextPageToken,items(status,summary,start,end,extendedProperties)',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const res = await fetch(`${EVENTS_URL}?${params}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
      if (!res.ok) {
        console.error('שגיאה בקריאת היומן לחישוב זמנים פנויים', await res.text().catch(() => ''));
        return null;
      }
      const data = await res.json();
      for (const ev of data.items || []) {
        if (ev.status === 'cancelled') continue;
        const isFitCall =
          ev.extendedProperties?.private?.[FIT_CALL_TAG] === '1' || String(ev.summary || '').startsWith(LEGACY_FIT_CALL_PREFIX);
        if (!isFitCall || !ev.start?.dateTime || !ev.end?.dateTime) continue;
        const start = Date.parse(ev.start.dateTime);
        const end = Date.parse(ev.end.dateTime);
        if (Number.isFinite(start) && Number.isFinite(end)) busy.push({ start, end });
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
  } catch (e) {
    console.error('שגיאה בקריאת היומן לחישוב זמנים פנויים', e);
    return null;
  }
  return busy;
}

// יוצר ביומן של שירן אירוע "שיחת היכרות" טלפוני. אם הפונה השאיר/ה מייל - הוא/היא מוזמנ/ת לאירוע ומקבל/ת
// הזמנה ליומן. מחזיר את מזהה האירוע, או null אם החיבור לא מוגדר או שהיצירה נכשלה.
export async function createFitCallEvent(opts: {
  start: Date;
  minutes: number;
  summary: string;
  description: string;
  phone: string;
  attendeeEmail?: string;
  // מזהה אירוע שנקבע מראש (אותיות a-v וספרות) - כדי שאפשר יהיה לשים בזימון קישור לשינוי/ביטול עוד לפני היצירה
  id?: string;
  // פרטים נוספים שנשמרים באירוע (לא גלויים לפונה) - למשל שם, טלפון ומזהה הליד במאנדיי, לשימוש בביטול/שינוי
  privateProps?: Record<string, string>;
  // מקבל את הקישור לאירוע האמיתי ביומן (htmlLink) - כדי לתת לפונה לפתוח אותו במקום ליצור עותק נפרד
  onHtmlLink?: (link: string) => void;
}): Promise<string | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;
  const end = new Date(opts.start.getTime() + opts.minutes * 60 * 1000);
  try {
    const res = await fetch(`${EVENTS_URL}?sendUpdates=${opts.attendeeEmail ? 'all' : 'none'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        summary: opts.summary,
        description: opts.description,
        location: `שיחת טלפון - שירן מתקשרת למספר ${opts.phone}`,
        start: { dateTime: opts.start.toISOString(), timeZone: 'Asia/Jerusalem' },
        end: { dateTime: end.toISOString(), timeZone: 'Asia/Jerusalem' },
        attendees: opts.attendeeEmail ? [{ email: opts.attendeeEmail }] : undefined,
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] },
        ...(opts.id ? { id: opts.id } : {}),
        extendedProperties: { private: { ...(opts.privateProps || {}), [FIT_CALL_TAG]: '1' } },
      }),
    });
    if (!res.ok) {
      console.error('שגיאה ביצירת אירוע שיחת התאמה ביומן', await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    if (data.htmlLink) opts.onHtmlLink?.(data.htmlLink);
    return data.id || null;
  } catch (e) {
    console.error('שגיאה ביצירת אירוע שיחת התאמה ביומן', e);
    return null;
  }
}

// ===== ניהול שיחה שכבר נקבעה (שינוי מועד / ביטול ע"י הפונה) =====

export type FitCallEvent = {
  id: string;
  start: string;
  end: string;
  cancelled: boolean;
  props: Record<string, string>;
  htmlLink: string;
};

// קורא אירוע שיחת התאמה לפי המזהה. מחזיר null אם החיבור לא מוגדר, האירוע לא קיים, או שהוא לא שיחת התאמה מהאתר
// קורא אירוע שיחת התאמה לפי המזהה. null = האירוע לא קיים (נמחק/בוטל); 'error' = תקלה בחיבור ליומן -
// כדי לא להציג לפונה "השיחה בוטלה" כשבפועל היא קיימת ורק הקריאה נכשלה
export async function getFitCallEvent(id: string): Promise<FitCallEvent | null | 'error'> {
  const accessToken = await getAccessToken();
  if (!accessToken) return 'error';
  try {
    const res = await fetch(`${EVENTS_URL}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) {
      console.error('שגיאה בקריאת אירוע שיחת התאמה', await res.text().catch(() => ''));
      return 'error';
    }
    const ev = await res.json();
    const props = ev.extendedProperties?.private || {};
    if (props[FIT_CALL_TAG] !== '1' || !ev.start?.dateTime) return null;
    return { id: ev.id, start: ev.start.dateTime, end: ev.end?.dateTime || ev.start.dateTime, cancelled: ev.status === 'cancelled', props, htmlLink: ev.htmlLink || '' };
  } catch (e) {
    console.error('שגיאה בקריאת אירוע שיחת התאמה', e);
    return 'error';
  }
}

// מבטל שיחה: מוחק את האירוע מהיומן ושולח עדכון ביטול למוזמנ/ת
export async function cancelFitCallEvent(id: string): Promise<boolean> {
  const accessToken = await getAccessToken();
  if (!accessToken) return false;
  try {
    const res = await fetch(`${EVENTS_URL}/${encodeURIComponent(id)}?sendUpdates=all`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok && res.status !== 410) {
      console.error('שגיאה בביטול אירוע שיחת התאמה', await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error('שגיאה בביטול אירוע שיחת התאמה', e);
    return false;
  }
}

// מזיז שיחה למועד חדש ושולח עדכון למוזמנ/ת
export async function moveFitCallEvent(id: string, start: Date, minutes: number): Promise<boolean> {
  const accessToken = await getAccessToken();
  if (!accessToken) return false;
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  try {
    const res = await fetch(`${EVENTS_URL}/${encodeURIComponent(id)}?sendUpdates=all`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        start: { dateTime: start.toISOString(), timeZone: 'Asia/Jerusalem' },
        end: { dateTime: end.toISOString(), timeZone: 'Asia/Jerusalem' },
      }),
    });
    if (!res.ok) {
      console.error('שגיאה בשינוי מועד שיחת התאמה', await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error('שגיאה בשינוי מועד שיחת התאמה', e);
    return false;
  }
}

// ===== אבחון וחיבור מחדש של היומן =====

export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

// בודק את החיבור צעד-צעד ומחזיר איפה בדיוק הוא נכשל - קודי שגיאה של גוגל בלבד, בלי ערכים סודיים.
// token = חידוש ההרשאה נכשל (למשל invalid_grant = ההרשאה פגה או בוטלה, צריך לחבר מחדש);
// list = ההרשאה תקינה אבל אין גישה לקריאת היומן
export async function diagnoseCalendarConnection(refreshTokenOverride?: string): Promise<{ ok: true } | { ok: false; step: 'config' | 'token' | 'list'; detail: string }> {
  const clientId = env('GOOGLE_CALENDAR_CLIENT_ID');
  const clientSecret = env('GOOGLE_CALENDAR_CLIENT_SECRET');
  const refreshToken = refreshTokenOverride || env('GOOGLE_CALENDAR_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) return { ok: false, step: 'config', detail: 'missing_env' };
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) return { ok: false, step: 'token', detail: String(data.error || res.status) };
    const list = await fetch(`${EVENTS_URL}?maxResults=1&timeMin=${encodeURIComponent(new Date().toISOString())}`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
      cache: 'no-store',
    });
    if (!list.ok) {
      const err = await list.json().catch(() => ({}));
      return { ok: false, step: 'list', detail: String(err?.error?.status || list.status) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, step: 'token', detail: 'network_error' };
  }
}

// מחליף קוד הרשאה (אחרי אישור במסך של גוגל) בטוקן קבוע (refresh token)
export async function exchangeGoogleAuthCode(code: string, redirectUri: string): Promise<{ refreshToken?: string; error?: string }> {
  const clientId = env('GOOGLE_CALENDAR_CLIENT_ID');
  const clientSecret = env('GOOGLE_CALENDAR_CLIENT_SECRET');
  if (!clientId || !clientSecret) return { error: 'missing_env' };
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: String(data.error_description || data.error || res.status) };
  if (!data.refresh_token) return { error: 'no_refresh_token' };
  return { refreshToken: data.refresh_token };
}
