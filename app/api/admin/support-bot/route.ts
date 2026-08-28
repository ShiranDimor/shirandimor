import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { callSupportBot } from '@/lib/supportBot';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// POST - שיחה עם בוט התמיכה (בדיקה פנימית לאדמין בלבד, לא חשוף למנויים)
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { messages } = await request.json().catch(() => ({}));
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'חסרות הודעות' }, { status: 400 });
  }

  try {
    const reply = await callSupportBot(messages);
    return NextResponse.json({ reply });
  } catch (e) {
    console.error('שגיאה בבוט התמיכה', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בבוט התמיכה' }, { status: 500 });
  }
}
