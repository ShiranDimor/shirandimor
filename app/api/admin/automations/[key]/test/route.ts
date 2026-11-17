import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { buildAutomationMessage } from '@/lib/automations';
import { sendPushToUser } from '@/lib/webPush';

// market-digest קורא ל-generateMarketDigest, שיכול לקחת עד כמה דקות (חיפוש אינטרנט אמיתי
// עם ה-AI) - ר' הערה מקבילה ב-app/api/cron/daily-market-digest/route.ts
export const maxDuration = 300;

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// POST - בדיקה לעצמי: שולח התראת פוש רק למנהלת המחוברת, עם ההודעה כפי שהייתה יוצאת עכשיו
// (עם נתוני דוגמה אם אין כרגע נתונים אמיתיים). לא יוצר טיוטה ולא מעדכן "רץ לאחרונה"
export async function POST(request: Request, { params }: { params: { key: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  let msg: { title: string; content: string; usedSample: boolean };
  if (params.key === 'market-digest') {
    const { generateMarketDigest } = await import('@/lib/marketDigest');
    const digest = await generateMarketDigest();
    if ('reason' in digest) return NextResponse.json({ error: `הכנת הסיכום נכשלה: ${digest.reason}` }, { status: 500 });
    msg = { title: digest.title, content: digest.content, usedSample: false };
  } else {
    const built = await buildAutomationMessage(params.key, true);
    if ('error' in built) return NextResponse.json({ error: 'לאוטומציה הזו אין נוסח קבוע לבדיקה' }, { status: 400 });
    msg = built;
  }

  const result = await sendPushToUser(admin.id, {
    title: `🧪 ${msg.title}`,
    body: msg.content.length > 120 ? `${msg.content.slice(0, 117)}...` : msg.content,
    url: '/admin/automations',
  });

  return NextResponse.json({ ok: true, usedSample: msg.usedSample, ...result });
}
