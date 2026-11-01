import { track } from '@vercel/analytics';
import { getStoredSource } from '@/lib/attribution';

export type FunnelEvent =
  | 'free_group_lead_submitted'
  | 'whatsapp_group_open_click'
  | 'trading_plan_started'
  | 'trading_plan_completed'
  | 'payment_link_click'
  | 'live_registered'
  | 'live_registration_lead'
  // עמוד הליווי האישי (/mentoring)
  | 'mentoring_page_view'
  | 'mentoring_cta_click'
  | 'mentoring_form_started'
  | 'mentoring_form_completed'
  | 'mentoring_calendar_opened'
  | 'mentoring_call_booked';

// מיפוי לאירועי המרה סטנדרטיים של פייסבוק/מטא, כדי שקמפיינים ממומנים ידעו לבצע אופטימיזציה
// לפי מי שבאמת מתקדם במשפך - לא רק כניסות לעמוד. פועל רק אם ה-Pixel מוגדר (ראו components/MetaPixel).
// אירוע בלי מיפוי (Partial) פשוט לא נשלח לפיקסל - רק ל-Vercel ולדאטהבייס
const META_PIXEL_EVENT: Partial<Record<FunnelEvent, string>> = {
  free_group_lead_submitted: 'Lead',
  whatsapp_group_open_click: 'CompleteRegistration',
  trading_plan_started: 'InitiateCheckout',
  trading_plan_completed: 'CompleteRegistration',
  payment_link_click: 'AddPaymentInfo',
  live_registered: 'CompleteRegistration',
  live_registration_lead: 'Lead',
  mentoring_page_view: 'ViewContent',
  mentoring_form_completed: 'Lead',
  mentoring_call_booked: 'Schedule',
};

// מצב "לא לספור אותי" למי שבודקת/בודק את האתר (שירן או קלוד) - כדי שבדיקות לא יזהמו את משפך
// ההמרה. מופעל פעם אחת per דפדפן/מכשיר ע"י כניסה לכתובת כלשהי באתר עם ?notrack=1 בסוף (נשמר
// לצמיתות ב-localStorage), וכבוי בחזרה עם ?notrack=0
const NOTRACK_KEY = 'sd_notrack';

export function isNoTrackMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('notrack');
    if (flag === '1') localStorage.setItem(NOTRACK_KEY, '1');
    if (flag === '0') localStorage.removeItem(NOTRACK_KEY);
    return localStorage.getItem(NOTRACK_KEY) === '1';
  } catch {
    return false;
  }
}

// שולח את האירוע ל-Vercel Analytics, לדאטהבייס שלנו (למשפך ההמרה באדמין) ול-Meta Pixel (אם מוגדר).
// identity (טלפון/מייל, אם ידועים) משמש רק בצד השרת כדי לא לספור במשפך ההמרה מנוי קיים שבודק
// לעצמו - כדי שהמספרים באדמין ישקפו תנועה אמיתית של לידים חדשים
export function trackFunnelEvent(
  event: FunnelEvent,
  identity?: { phone?: string | null; email?: string | null },
  props?: Record<string, string | number>
) {
  if (isNoTrackMode()) return;

  track(event, props);
  fetch('/api/track-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, phone: identity?.phone, email: identity?.email, source: getStoredSource() }),
  }).catch(() => {});

  const fbq = (window as any).fbq;
  const pixelEvent = META_PIXEL_EVENT[event];
  if (typeof fbq === 'function' && pixelEvent) {
    fbq('track', pixelEvent);
  }
}

// אירוע מדידה קל ל-Vercel Analytics בלבד (לא למשפך בדאטהבייס ולא לפיקסל) - למשל עומק גלילה,
// שהיה מציף את טבלת המשפך בשורות
export function trackLightEvent(name: string, props?: Record<string, string | number>) {
  if (isNoTrackMode()) return;
  track(name, props);
}
