import { track } from '@vercel/analytics';

export type FunnelEvent =
  | 'free_group_lead_submitted'
  | 'whatsapp_group_open_click'
  | 'trading_plan_started'
  | 'trading_plan_completed'
  | 'payment_link_click';

// מיפוי לאירועי המרה סטנדרטיים של פייסבוק/מטא, כדי שקמפיינים ממומנים ידעו לבצע אופטימיזציה
// לפי מי שבאמת מתקדם במשפך - לא רק כניסות לעמוד. פועל רק אם ה-Pixel מוגדר (ראו components/MetaPixel).
const META_PIXEL_EVENT: Record<FunnelEvent, string> = {
  free_group_lead_submitted: 'Lead',
  whatsapp_group_open_click: 'CompleteRegistration',
  trading_plan_started: 'InitiateCheckout',
  trading_plan_completed: 'CompleteRegistration',
  payment_link_click: 'AddPaymentInfo',
};

// שולח את האירוע ל-Vercel Analytics, לדאטהבייס שלנו (למשפך ההמרה באדמין) ול-Meta Pixel (אם מוגדר)
export function trackFunnelEvent(event: FunnelEvent) {
  track(event);
  fetch('/api/track-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event }),
  }).catch(() => {});

  const fbq = (window as any).fbq;
  if (typeof fbq === 'function') {
    fbq('track', META_PIXEL_EVENT[event]);
  }
}
