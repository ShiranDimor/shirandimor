import { track } from '@vercel/analytics';

export type FunnelEvent =
  | 'free_group_lead_submitted'
  | 'whatsapp_group_open_click'
  | 'trading_plan_started'
  | 'trading_plan_completed'
  | 'payment_link_click';

// שולח את האירוע גם ל-Vercel Analytics וגם לדאטהבייס שלנו (כדי שאפשר יהיה להציג את
// משפך ההמרה ישירות באזור הניהול, בלי תלות בתוכנית של Vercel)
export function trackFunnelEvent(event: FunnelEvent) {
  track(event);
  fetch('/api/track-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event }),
  }).catch(() => {});
}
