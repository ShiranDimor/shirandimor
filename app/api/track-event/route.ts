import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

// שמות אירועי ההמרה הנעקבים - חייב להיות תואם למה שנשלח גם ל-Vercel Analytics
const ALLOWED_EVENTS = [
  'free_group_lead_submitted',
  'whatsapp_group_open_click',
  'trading_plan_started',
  'trading_plan_completed',
  'payment_link_click',
] as const;

// POST - רישום אירוע המרה בדאטהבייס (בנוסף ל-Vercel Analytics) - כדי שאפשר יהיה להציג
// את משפך ההמרה ישירות באזור הניהול, בלי תלות בתוכנית של Vercel
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const event = body?.event;

  if (typeof event !== 'string' || !ALLOWED_EVENTS.includes(event as (typeof ALLOWED_EVENTS)[number])) {
    return NextResponse.json({ error: 'אירוע לא מוכר' }, { status: 400 });
  }

  try {
    await supabaseAdmin.from('funnel_events').insert({ event_name: event });
  } catch {}

  return NextResponse.json({ ok: true });
}
