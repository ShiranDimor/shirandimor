import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { callSupportBot, extractContactFromText, buildRuntimeContextBlock } from '@/lib/supportBot';
import { classifyContactMonday } from '@/lib/tradingPlan/monday';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// מוצא שיחה קיימת של המשתמש, או יוצר אחת חדשה - ומזהה את סוג המשתמש (user_type) בפעם הראשונה:
// אדמין נחשב admin_test; אחרת נבדק הפרופיל באתר ומול מאנדיי (מנוי פעיל / קבוצת עדכונים / ליד חדש)
async function getOrCreateConversation(userId: string) {
  const { data: existing } = await supabaseAdmin
    .from('support_bot_conversations')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) return existing;

  const { data: profile } = await supabaseAdmin.from('profiles').select('role, full_name, phone, email').eq('id', userId).single();

  let userType: string = 'unknown';
  if (profile?.role === 'admin') {
    userType = 'admin_test';
  } else if (profile?.role === 'subscriber') {
    userType = 'member_active';
  } else if (profile?.phone || profile?.email) {
    userType = await classifyContactMonday(profile.phone, profile.email);
  }

  const { data: created } = await supabaseAdmin
    .from('support_bot_conversations')
    .insert({
      user_id: userId,
      contact_name: profile?.full_name || null,
      contact_phone: profile?.phone || null,
      contact_email: profile?.email || null,
      user_type: userType,
    })
    .select('*')
    .single();

  return created;
}

// הלייב הקרוב הבא שמפורסם באתר - נתון אמיתי, לא מומצא, כדי שדור תדע לענות "מתי הלייב הבא" במדויק
async function getNextLive() {
  const { data } = await supabaseAdmin
    .from('lives')
    .select('title, scheduled_at')
    .eq('published', true)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { title: data.title, scheduledAt: data.scheduled_at };
}

// נתוני התיק האמיתיים לחודש הנוכחי (עסקאות שנסגרו, אחוז רווחיות) - כדי שדור תוכל לשתף תוצאה
// מאומתת אם רלוונטי, בלי להמציא מספרים
async function getMonthTradeStats() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data } = await supabaseAdmin
    .from('trades')
    .select('realized_pnl_usd')
    .eq('status', 'closed')
    .gte('closed_at', monthStart);

  if (!data || data.length === 0) return null;

  const closedCount = data.length;
  const winCount = data.filter((t) => (t.realized_pnl_usd || 0) > 0).length;
  const monthLabel = now.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });

  return { closedCount, winCount, monthLabel };
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
// ונטענת לפי המשתמש, ומזוהה סוג המשתמש מול מאנדיי כדי לתת הקשר-ריצה מדויק לבוט
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { message } = await request.json().catch(() => ({}));
  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'חסרה הודעה' }, { status: 400 });
  }

  const conversation = await getOrCreateConversation(admin.id);

  // זיהוי הזדמנותי: אם המשתמש שיתף טלפון/מייל תוך כדי השיחה ועדיין אין לנו את זה שמור - שומרים,
  // ואם הזהות עדיין לא ידועה, מסווגים מול מאנדיי לפי הפרט החדש
  const extracted = extractContactFromText(message);
  const updates: Record<string, unknown> = {};
  if (extracted.phone && !conversation?.contact_phone) updates.contact_phone = extracted.phone;
  if (extracted.email && !conversation?.contact_email) updates.contact_email = extracted.email;
  if ((extracted.phone || extracted.email) && (!conversation?.user_type || conversation.user_type === 'unknown')) {
    updates.user_type = await classifyContactMonday(
      extracted.phone || conversation?.contact_phone || null,
      extracted.email || conversation?.contact_email || null
    );
  }
  if (Object.keys(updates).length > 0 && conversation) {
    await supabaseAdmin.from('support_bot_conversations').update(updates).eq('id', conversation.id);
  }
  const effectiveUserType = (updates.user_type as string | undefined) ?? conversation?.user_type ?? null;
  const effectiveContactName = conversation?.contact_name ?? null;

  const { data: history, error: historyError } = await supabaseAdmin
    .from('support_bot_messages')
    .select('role, content')
    .eq('user_id', admin.id)
    .order('created_at', { ascending: true });

  if (historyError) return NextResponse.json({ error: 'שגיאה בטעינת ההיסטוריה' }, { status: 500 });

  const fullConversation: { role: 'user' | 'assistant'; content: string }[] = [
    ...((history || []) as { role: 'user' | 'assistant'; content: string }[]),
    { role: 'user', content: message },
  ];

  try {
    const [nextLive, monthStats] = await Promise.all([getNextLive(), getMonthTradeStats()]);
    const runtimeContext = buildRuntimeContextBlock({
      userType: effectiveUserType,
      contactName: effectiveContactName,
      nextLive,
      monthStats,
    });
    const reply = await callSupportBot(fullConversation, runtimeContext);

    await supabaseAdmin.from('support_bot_messages').insert([
      { user_id: admin.id, conversation_id: conversation?.id, role: 'user', content: message },
      { user_id: admin.id, conversation_id: conversation?.id, role: 'assistant', content: reply },
    ]);

    if (conversation) {
      await supabaseAdmin.from('support_bot_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation.id);
    }

    return NextResponse.json({ reply });
  } catch (e) {
    console.error('שגיאה בבוט התמיכה', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בבוט התמיכה' }, { status: 500 });
  }
}
