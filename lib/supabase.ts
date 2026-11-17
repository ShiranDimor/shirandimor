import { createClient, type User } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// כולם נשארים מחוברים תמיד (localStorage, ברירת המחדל הרגילה של Supabase - לא מגדירים
// storage מותאם בכלל) - בלי תיבת "השאר אותי מחובר" ובלי sessionStorage. פשוט בכוונה
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// שליפת משתמש "עמידה" - getUser() עושה קריאת רשת חיה ל-Supabase כדי לאמת את ה-JWT, וזה
// יכול להיכשל זמנית על רשת סלולרית חלשה (למשל מיד אחרי לחיצה על התראת פוש, לפני שהרשת
// התייצבה). בלי הגנה כאן, כישלון רשת רגעי כזה היה גורם לדף להתייחס למשתמש כאילו הוא לא
// מחובר בכלל, למרות שה-session המקומי שלו תקין לגמרי - בדיוק התחושה של "מתנתק כל הזמן"
// שמנויים מתלוננים עליה. getSession() קודם הוא קריאה מקומית בלבד (בלי רשת): אם אין בכלל
// session מקומי, אין טעם אפילו לנסות אימות מול השרת - המשתמש באמת לא מחובר. אם יש session
// מקומי, מנסים לאמת/לרענן מול השרת לדיוק, אבל אם זה נכשל בגלל רשת - סומכים על המשתמש
// מה-session המקומי במקום "לנתק" מישהו שבאמת עדיין מחובר
export async function getResilientUser(): Promise<User | null> {
  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  if (!session) return null;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user ?? session.user;
  } catch (e) {
    return session.user;
  }
}
