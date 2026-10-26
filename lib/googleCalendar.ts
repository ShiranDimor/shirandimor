// יצירת אירוע ביומן Google של שירן (כולל קישור Google Meet) בכל פעם שנוצר לייב חדש - דרך חשבון
// שמחובר פעם אחת מראש (OAuth), לא תלוי בכל משתמש/מבקר באתר. אם המשתנים לא מוגדרים בסביבה,
// הפונקציה פשוט לא עושה כלום - יצירת הלייב עצמה לא נכשלת בגלל זה.
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const DEFAULT_DURATION_MINUTES = 60;

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
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
        extendedProperties: { private: { [FIT_CALL_TAG]: '1' } },
      }),
    });
    if (!res.ok) {
      console.error('שגיאה ביצירת אירוע שיחת התאמה ביומן', await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    return data.id || null;
  } catch (e) {
    console.error('שגיאה ביצירת אירוע שיחת התאמה ביומן', e);
    return null;
  }
}
