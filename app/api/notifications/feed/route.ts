import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { hasActiveEntitlement } from '@/lib/entitlement';

// GET - ההיסטוריה שמוצגת בפעמון ההתראות הגלובלי באתר - אותו תוכן שבאמת נשלח כהתראת פוש
// (lib/webPush.ts רושם כל שידור ל-notification_log), מסונן לפי קהל: מנוי רואה את הגרסה המלאה
// (audience='subscribers' + 'everyone'), כל אחד אחר רואה את הגרסה המטושטשת
// (audience='non_subscribers' + 'everyone') - בדיוק כמו ההתראה שהיה מקבל בפועל.
//
// "מנוי" נקבע קודם לפי session מחובר, ואם אין session תקף (או session ישן שמצביע על חשבון
// שכבר לא קיים, למשל אחרי שחשבון נמחק ונוצר מחדש) - נופלים חזרה לזיהוי לפי מנוי הפוש של
// המכשיר עצמו (endpoint): אם המכשיר הזה כבר רשום ב-push_subscriptions עם user_id ששייך
// למנוי פעיל, מתייחסים אליו כמנוי גם בלי session - כי זה בדיוק מה שקובע אילו התראות פוש
// אמיתיות (לא רק ההיסטוריה כאן) כבר מגיעות למכשיר הזה. בלי זה, מנוי אמיתי שאין לו session
// מחובר בדפדפן הזה (למשל הפעיל התראות דרך שער ליד לפני שהתחבר, או שחשבונו שוחזר) רואה כאן
// היסטוריה שקרית של "ליד" למרות שבפועל הוא מקבל את ההתראות המלאות
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const deviceEndpoint = searchParams.get('endpoint');

  let isSubscriber = false;
  if (token) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('role, subscription_status, subscription_paid_until').eq('id', user.id).maybeSingle();
      isSubscriber = hasActiveEntitlement(profile);
    }
  }

  if (!isSubscriber && deviceEndpoint) {
    const { data: sub } = await supabaseAdmin.from('push_subscriptions').select('user_id').eq('endpoint', deviceEndpoint).maybeSingle();
    if (sub?.user_id) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('role, subscription_status, subscription_paid_until').eq('id', sub.user_id).maybeSingle();
      isSubscriber = hasActiveEntitlement(profile);
    }
  }

  const audiences = isSubscriber ? ['subscribers', 'everyone'] : ['non_subscribers', 'everyone'];
  const { data, error } = await supabaseAdmin
    .from('notification_log')
    .select('id, kind, title, body, url, created_at')
    .in('audience', audiences)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: 'שגיאה בשליפה' }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}
