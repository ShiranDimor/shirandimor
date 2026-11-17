import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
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

// POST - שליחת התראת פוש אמיתית למנוי/ה ספציפי/ת בלבד, לצורך בדיקת תקלות מול מישהו/י אחד/ת -
// לא יוצרת שום הודעה בלוח המודעות, לא נרשמת ב-notification_log, ולא נשלחת לאף אחד אחר
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data: target } = await supabaseAdmin.from('profiles').select('id, full_name').eq('id', params.id).maybeSingle();
  if (!target) return NextResponse.json({ error: 'המנוי/ה לא נמצא/ה' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === 'string' && body.text.trim() ? body.text.trim() : 'זוהי הודעת בדיקה מהמערכת';

  const result = await sendPushToUser(params.id, {
    title: `🧪 בדיקה אישית עבור ${target.full_name || ''}`.trim(),
    body: text,
    url: '/announcements',
  });

  return NextResponse.json({ ok: true, ...result });
}
