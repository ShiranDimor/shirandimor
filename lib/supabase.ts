import { createClient, type User } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const REMEMBER_KEY = 'sd_remember_me';

// ברירת המחדל: כן לזכור (localStorage) - זה גם ההתנהגות שהייתה קיימת קודם (הקליינט הישן
// לא הגדיר storage בכלל, ו-Supabase ברירת המחדל שלו היא גם localStorage), אז זה לא שינוי
// התנהגות למי שלא נגע בתיבת הסימון - רק מי שמסמן "לא לזכור" עובר בפועל ל-sessionStorage
function rememberEnabled(): boolean {
  try {
    return window.localStorage.getItem(REMEMBER_KEY) !== '0';
  } catch (e) {
    return true;
  }
}

// נקרא מעמוד ההתחברות לפני פעולת ההתחברות עצמה (לא אחריה) - כדי שברגע שהסשן נכתב
// לאחסון, ההעדפה הנוכחית כבר תקבע לאן הוא נכתב
export function setRememberPreference(remember: boolean) {
  try {
    window.localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
  } catch (e) {
    // localStorage חסום (גלישה פרטית וכו') - לא קריטי, ברירת המחדל של הדפדפן תמשיך לחול
  }
}

// storage מותאם שמפנה בפועל ל-localStorage (״השאר אותי מחובר״, ברירת המחדל) או ל-
// sessionStorage (מסתיים כשסוגרים את הטאב/האפליקציה) לפי ההעדפה השמורה - עם ניקוי מהצד
// השני כדי שלא יישארו שני עותקים סותרים של אותו מפתח אחרי שהמשתמש מחליף העדפה
const dualStorage = {
  getItem(key: string) {
    try {
      return (rememberEnabled() ? window.localStorage : window.sessionStorage).getItem(key);
    } catch (e) {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      const primary = rememberEnabled() ? window.localStorage : window.sessionStorage;
      const other = primary === window.localStorage ? window.sessionStorage : window.localStorage;
      primary.setItem(key, value);
      other.removeItem(key);
    } catch (e) {
      // ignore
    }
  },
  removeItem(key: string) {
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch (e) {
      // ignore
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? dualStorage : undefined,
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
