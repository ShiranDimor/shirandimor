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
