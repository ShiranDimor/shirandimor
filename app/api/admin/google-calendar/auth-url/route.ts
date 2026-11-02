import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { GOOGLE_CALENDAR_SCOPE, diagnoseCalendarConnection, env } from '@/lib/googleCalendar';
import { makeState, redirectUri } from '@/lib/googleReconnect';

export const dynamic = 'force-dynamic';

async function requireAdmin(request: Request) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'admin' ? user : null;
}

// מצב החיבור הנוכחי + קישור למסך האישור של גוגל (אדמין בלבד)
export async function GET(request: Request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });
  const clientId = env('GOOGLE_CALENDAR_CLIENT_ID');
  const status = await diagnoseCalendarConnection();
  // "טביעת אצבע" של הערכים שהאתר רואה - בלי לחשוף אותם - כדי להשוות מול קובץ ה-JSON מגוגל
  const clean = env;
  const sec = clean('GOOGLE_CALENDAR_CLIENT_SECRET');
  const cid = clean('GOOGLE_CALENDAR_CLIENT_ID');
  const fingerprint = {
    clientIdStart: cid.slice(0, 12),
    secretStartsRight: sec.startsWith('GOCSPX-'),
    secretLength: sec.length,
    secretEnd: sec.slice(-4),
  };
  if (!clientId) return NextResponse.json({ status, fingerprint, url: null, redirectUri: redirectUri(request.url) });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(request.url),
    response_type: 'code',
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: 'offline',
    // תמיד לבחור חשבון (לא להתחבר אוטומטית לחשבון אחר שפתוח בדפדפן), עם הצעה מראש לחשבון של היומן
    prompt: 'consent select_account',
    login_hint: process.env.GOOGLE_CALENDAR_ACCOUNT_EMAIL || 'shiran@shirandimor.com',
    state: makeState(),
  });
  return NextResponse.json({ status, fingerprint, url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, redirectUri: redirectUri(request.url) });
}
