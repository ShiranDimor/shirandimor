// לוגיקת שיחה משותפת לבוט התמיכה "דור" - משמשת גם את דף הבדיקה הפנימי לאדמין
// וגם את הווידג'ט הציבורי באתר, כדי שלא תהיה כפילות בין שני נתיבי ה-API.
import { supabaseAdmin } from '@/lib/instantLogin';
import { classifyContactMonday } from '@/lib/tradingPlan/monday';

export type SupportBotConversation = {
  id: string;
  user_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  user_type: string | null;
  lead_intent: string;
};

// מוצא שיחה קיימת לפי מזהה (userId אמיתי של משתמש מחובר, או מזהה אנונימי שנוצר בדפדפן), או יוצר אחת חדשה -
// ומזהה את סוג המשתמש (user_type) בפעם הראשונה: אדמין = admin_test, מנוי לפי הפרופיל = member_active,
// אחרת נבדק מול מאנדיי אם יש פרטי קשר בפרופיל, ואם אין - נשאר "unknown" עד שישותפו פרטים בשיחה עצמה.
export async function getOrCreateConversation(
  identityId: string,
  profile?: { role?: string | null; full_name?: string | null; phone?: string | null; email?: string | null } | null
): Promise<SupportBotConversation | null> {
  const { data: existing } = await supabaseAdmin
    .from('support_bot_conversations')
    .select('*')
    .eq('user_id', identityId)
    .maybeSingle();

  if (existing) return existing;

  let userType = 'unknown';
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
      user_id: identityId,
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
export async function getNextLive() {
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
export async function getMonthTradeStats() {
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
