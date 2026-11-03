import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { buildAutomationMessage } from '@/lib/automations';
import { sendPushToUser } from '@/lib/webPush';

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

  const msg = await buildAutomationMessage(params.key, true);
  if ('error' in msg) return NextResponse.json({ error: 'לאוטומציה הזו אין נוסח קבוע לבדיקה' }, { status: 400 });

  const result = await sendPushToUser(admin.id, {
    title: `🧪 ${msg.title}`,
    body: msg.content.length > 120 ? `${msg.content.slice(0, 117)}...` : msg.content,
    url: '/admin/automations',
  });

  return NextResponse.json({ ok: true, usedSample: msg.usedSample, ...result });
}
