import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { isActiveSubscriber } from '@/lib/subscriberStatus';
import { isContactInSubscribersGroupMonday } from '@/lib/tradingPlan/monday';

// שמות אירועי ההמרה הנעקבים - חייב להיות תואם למה שנשלח גם ל-Vercel Analytics
const ALLOWED_EVENTS = [
  'free_group_lead_submitted',
  'whatsapp_group_open_click',
  'trading_plan_started',
  'trading_plan_completed',
  'payment_link_click',
  'live_registered',
  'live_registration_lead',
] as const;

// POST - רישום אירוע המרה בדאטהבייס (בנוסף ל-Vercel Analytics) - כדי שאפשר יהיה להציג
// את משפך ההמרה ישירות באזור הניהול, בלי תלות בתוכנית של Vercel.
// אם מצורפים phone/email ומזוהה מנוי פעיל - האירוע לא נספר, כדי שהמשפך ישקף תנועה
// אמיתית של לידים חדשים בלבד, לא בדיקות עצמיות של מנויים קיימים
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const event = body?.event;
  const phone = typeof body?.phone === 'string' ? body.phone : null;
  const email = typeof body?.email === 'string' ? body.email : null;
  const source = typeof body?.source === 'string' ? body.source.slice(0, 100) : null;

  if (typeof event !== 'string' || !ALLOWED_EVENTS.includes(event as (typeof ALLOWED_EVENTS)[number])) {
    return NextResponse.json({ error: 'אירוע לא מוכר' }, { status: 400 });
  }

  if (phone || email) {
    const isSubscriber = (await isActiveSubscriber(phone, email)) || (await isContactInSubscribersGroupMonday(phone, email));
    if (isSubscriber) return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    await supabaseAdmin.from('funnel_events').insert({ event_name: event, source });
  } catch {}

  return NextResponse.json({ ok: true });
}
