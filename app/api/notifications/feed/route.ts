import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

// GET - ההיסטוריה שמוצגת בפעמון ההתראות הגלובלי באתר - אותו תוכן שבאמת נשלח כהתראת פוש
// (lib/webPush.ts רושם כל שידור ל-notification_log), מסונן לפי קהל: מנוי מחובר רואה את
// הגרסה המלאה (audience='subscribers' + 'everyone'), כל אחד אחר רואה את הגרסה המטושטשת
// (audience='non_subscribers' + 'everyone') - בדיוק כמו ההתראה שהיה מקבל בפועל
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  let isSubscriber = false;
  if (token) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('role, subscription_status').eq('id', user.id).maybeSingle();
      isSubscriber = profile?.role === 'admin' || (profile?.role === 'subscriber' && profile?.subscription_status === 'active');
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
