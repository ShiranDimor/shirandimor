import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// GET - כל השיחות עם בוט התמיכה, למי מתכתב איתו ומה סוג המשתמש/עוצמת העניין שלו - כדי לדעת
// למי כדאי לפנות ביזמה
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data: conversations, error } = await supabaseAdmin
    .from('support_bot_conversations')
    .select('id, contact_name, contact_phone, contact_email, user_type, lead_intent, created_at, last_message_at, summary')
    .order('last_message_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'שגיאה בטעינת השיחות' }, { status: 500 });

  const ids = (conversations || []).map((c) => c.id);
  const { data: counts } = ids.length
    ? await supabaseAdmin.from('support_bot_messages').select('conversation_id').in('conversation_id', ids)
    : { data: [] as { conversation_id: string }[] };

  const countByConversation = new Map<string, number>();
  for (const row of counts || []) {
    countByConversation.set(row.conversation_id, (countByConversation.get(row.conversation_id) || 0) + 1);
  }

  return NextResponse.json({
    conversations: (conversations || []).map((c) => ({ ...c, messageCount: countByConversation.get(c.id) || 0 })),
  });
}

// PATCH - עדכון ידני של עוצמת העניין (lead_intent) לשיחה - למשל לסמן "hot" כדי לדעת שכדאי לפנות
export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { conversationId, leadIntent } = await request.json().catch(() => ({}));
  const validIntents = ['cold', 'curious', 'engaged', 'warm', 'hot', 'support'];
  if (!conversationId || !validIntents.includes(leadIntent)) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('support_bot_conversations').update({ lead_intent: leadIntent }).eq('id', conversationId);
  if (error) return NextResponse.json({ error: 'שגיאה בעדכון' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
