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

// GET - טוען את היסטוריית השיחה השמורה, כדי שרענון/חזרה לדף לא תתחיל מהתחלה
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('support_bot_messages')
    .select('role, content')
    .eq('user_id', admin.id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: 'שגיאה בטעינת ההיסטוריה' }, { status: 500 });

  return NextResponse.json({ messages: data || [] });
}

// POST - שיחה עם בוט התמיכה (בדיקה פנימית לאדמין בלבד, לא חשוף למנויים) - ההיסטוריה נשמרת
// ונטענת לפי המשתמש, כדי שרענון דף או חזרה מאוחר יותר ימשיכו מאותו מקום
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { message } = await request.json().catch(() => ({}));
  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'חסרה הודעה' }, { status: 400 });
  }

  const { data: history, error: historyError } = await supabaseAdmin
    .from('support_bot_messages')
    .select('role, content')
    .eq('user_id', admin.id)
    .order('created_at', { ascending: true });

  if (historyError) return NextResponse.json({ error: 'שגיאה בטעינת ההיסטוריה' }, { status: 500 });

  const conversation: { role: 'user' | 'assistant'; content: string }[] = [
    ...((history || []) as { role: 'user' | 'assistant'; content: string }[]),
    { role: 'user', content: message },
  ];

  try {
    const reply = await callSupportBot(conversation);

    await supabaseAdmin.from('support_bot_messages').insert([
      { user_id: admin.id, role: 'user', content: message },
      { user_id: admin.id, role: 'assistant', content: reply },
    ]);

    return NextResponse.json({ reply });
  } catch (e) {
    console.error('שגיאה בבוט התמיכה', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בבוט התמיכה' }, { status: 500 });
  }
}
