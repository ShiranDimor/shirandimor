import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { callSupportBot, extractContactFromText, extractGenderFromText, buildRuntimeContextBlock } from '@/lib/supportBot';
import { classifyContactMonday, syncGenericLead } from '@/lib/tradingPlan/monday';
import { getOrCreateConversation, getNextLive, getMonthTradeStats } from '@/lib/supportBotConversation';

// מזהה את הפונה: אם יש טוקן התחברות תקין - זה המשתמש האמיתי (וגם הפרופיל שלו נטען לסיווג מדויק).
// אם אין טוקן (מבקר/ת אנונימי/ת באתר) - המזהה הוא anonId שנוצר ונשמר בדפדפן של המבקר עצמו,
// ולא ניתן להשתמש בו כדי להתחזות למשתמש מחובר אמיתי כי לעולם לא מתקבל userId ישירות מהלקוח.
async function resolveIdentity(request: Request, anonId: string | null) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  if (token) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('role, full_name, phone, email').eq('id', user.id).single();
      return { id: user.id, profile };
    }
  }

  // אין הגבלת מפתח זר על user_id (זה לא בהכרח משתמש רשום), ולכן אפשר להשתמש ב-UUID
  // האנונימי כפי שהוא כמזהה השיחה - כל עוד הוא בפורמט UUID תקין (נוצר בדפדפן, בעל אנטרופיה מספיקה)
  if (anonId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(anonId)) {
    return { id: anonId, profile: null };
  }

  return null;
}

// GET - טוען היסטוריית שיחה קיימת (אם יש) לפי המזהה, כדי שרענון/חזרה לאתר לא יתחילו שיחה מהתחלה
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const identity = await resolveIdentity(request, searchParams.get('anonId'));
  if (!identity) return NextResponse.json({ messages: [] });

  const { data, error } = await supabaseAdmin
    .from('support_bot_messages')
    .select('role, content')
    .eq('user_id', identity.id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: 'שגיאה בטעינת ההיסטוריה' }, { status: 500 });

  return NextResponse.json({ messages: data || [] });
}

// POST - שיחה עם דור, פתוחה לכל מבקר/ת באתר (מחובר/ת או אנונימי/ת) - ההיסטוריה נשמרת לפי המזהה,
// וסוג הפונה מסווג מול מאנדיי (מנוי/ת פעיל/ה, קבוצת עדכונים, ליד חדש) ברגע שיש פרטי קשר
export async function POST(request: Request) {
  const { message, anonId } = await request.json().catch(() => ({}));
  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'חסרה הודעה' }, { status: 400 });
  }
  if (message.length > 4000) {
    return NextResponse.json({ error: 'ההודעה ארוכה מדי' }, { status: 400 });
  }

  const identity = await resolveIdentity(request, typeof anonId === 'string' ? anonId : null);
  if (!identity) {
    return NextResponse.json({ error: 'לא ניתן לזהות את השיחה - רעננו את הדף ונסו שוב' }, { status: 400 });
  }

  const conversation = await getOrCreateConversation(identity.id, identity.profile);

  // זיהוי הזדמנותי: אם הפונה שיתף טלפון/מייל תוך כדי השיחה ועדיין אין לנו את זה שמור - שומרים,
  // ואם הזהות עדיין לא ידועה, מסווגים מול מאנדיי לפי הפרט החדש
  const extracted = extractContactFromText(message);
  const updates: Record<string, unknown> = {};
  if (extracted.phone && !conversation?.contact_phone) updates.contact_phone = extracted.phone;
  if (extracted.email && !conversation?.contact_email) updates.contact_email = extracted.email;
  let newlyClassifiedType: string | null = null;
  if ((extracted.phone || extracted.email) && (!conversation?.user_type || conversation.user_type === 'unknown')) {
    newlyClassifiedType = await classifyContactMonday(
      extracted.phone || conversation?.contact_phone || null,
      extracted.email || conversation?.contact_email || null
    );
    updates.user_type = newlyClassifiedType;
  }
  // זיהוי בחירת הפנייה (זכר/נקבה) - נשמר פעם אחת ומוזרק מחדש בכל תור בשיחה, כדי שהמודל
  // לא "יסטה" חזרה לברירת מחדל אחרי כמה הודעות בלי תזכורת מפורשת
  if (!conversation?.gender) {
    const detectedGender = extractGenderFromText(message);
    if (detectedGender) updates.gender = detectedGender;
  }

  if (Object.keys(updates).length > 0 && conversation) {
    await supabaseAdmin.from('support_bot_conversations').update(updates).eq('id', conversation.id);
  }
  const effectiveUserType = (updates.user_type as string | undefined) ?? conversation?.user_type ?? null;
  const effectiveContactName = conversation?.contact_name ?? null;
  const effectiveGender = (updates.gender as 'male' | 'female' | undefined) ?? conversation?.gender ?? null;

  // ליד חדש (לא מנוי/ה, לא בקבוצת עדכונים) ששיתף/ה פרטי קשר לראשונה בשיחה עם דור - מסונכרן
  // למאנדיי כדי שלא יישאר רק בטבלת השיחות/במייל סיכום שאפשר לפספס. רצה במקביל לתשובת ה-AI
  // למטה (לא ברצף) כדי לא להוסיף זמן המתנה לתשובה של דור בצ'אט
  const genericLeadSyncPromise = newlyClassifiedType === 'lead_new'
    ? syncGenericLead({
        phone: extracted.phone || conversation?.contact_phone || null,
        email: extracted.email || conversation?.contact_email || null,
        name: effectiveContactName,
        source: "שיחה עם דור (הבוט)",
        note: `ליד חדש משיחה עם דור באתר.${effectiveContactName ? ` שם: ${effectiveContactName}.` : ''}`,
      }).catch((e) => { console.error('שגיאה בסנכרון ליד מדור למאנדיי', e); return null; })
    : Promise.resolve(null);

  const { data: history, error: historyError } = await supabaseAdmin
    .from('support_bot_messages')
    .select('role, content')
    .eq('user_id', identity.id)
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
      gender: effectiveGender,
      nextLive,
      monthStats,
    });
    const [reply] = await Promise.all([callSupportBot(fullConversation, runtimeContext, effectiveGender), genericLeadSyncPromise]);

    await supabaseAdmin.from('support_bot_messages').insert([
      { user_id: identity.id, conversation_id: conversation?.id, role: 'user', content: message },
      { user_id: identity.id, conversation_id: conversation?.id, role: 'assistant', content: reply },
    ]);

    if (conversation) {
      await supabaseAdmin.from('support_bot_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation.id);
    }

    return NextResponse.json({ reply });
  } catch (e) {
    console.error('שגיאה בבוט התמיכה', e);
    return NextResponse.json({ error: 'משהו השתבש - נסו שוב עוד רגע' }, { status: 500 });
  }
}
