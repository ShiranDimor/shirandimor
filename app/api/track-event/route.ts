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
  'ad_landing_page_view',
  'ad_landing_cta_click',
  'mentoring_page_view',
  'mentoring_cta_click',
  'mentoring_form_started',
  'mentoring_form_completed',
  'mentoring_calendar_opened',
  'mentoring_call_booked',
  'social_landing_view',
] as const;

const BOT_UA = /facebookexternalhit|facebookcatalog|facebot|meta-external|\bbot\b|bot\/|crawler|spider|preview|headless|lighthouse|python-requests|curl\/|wget/i;

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

  // בוטים לא נספרים: פייסבוק/אינסטגרם שולחים סורק לבדוק כל לינק שמתפרסם (תצוגה מקדימה), והוא
  // נרשם כצרור "כניסות מפוסט" 17-50 שניות אחרי שהפוסט עולה - זה ניפח את דוחות הכניסות מהסושיאל
  const ua = request.headers.get('user-agent') || '';
  if (!ua || BOT_UA.test(ua)) return NextResponse.json({ ok: true, skipped: 'bot' });

  if (phone || email) {
    const isSubscriber = (await isActiveSubscriber(phone, email)) || (await isContactInSubscribersGroupMonday(phone, email));
    if (isSubscriber) return NextResponse.json({ ok: true, skipped: true });
  }

  // סורקים שמריצים JavaScript עם דפדפן "רגיל" לא נתפסים לפי user-agent, אבל מגיעים בצרורות
  // של 3-6 כניסות לאותו לינק באותן שניות. כניסה מהסושיאל עם אותו מקור תוך 5 שניות = אותו צרור
  if (event === 'social_landing_view') {
    const since = new Date(Date.now() - 5000).toISOString();
    const q = supabaseAdmin
      .from('funnel_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_name', event)
      .gte('created_at', since);
    const { count } = await (source ? q.eq('source', source) : q.is('source', null));
    if (count) return NextResponse.json({ ok: true, skipped: 'burst' });
  }

  try {
    await supabaseAdmin.from('funnel_events').insert({ event_name: event, source });
  } catch {}

  return NextResponse.json({ ok: true });
}
