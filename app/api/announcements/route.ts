import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

// ה-route הזה היה הפוך-GET-בלי-request היחיד באתר (ראה business-call/slots) בלי dynamic
// מפורש - Next App Router מזהה route כזה (בלי headers/cookies/searchParams) כסטטי לגמרי
// ומקפיא אותו ב-build/deploי. בפועל dynamic='force-dynamic' לבדו לא הספיק - גם אחרי כמה
// דיפלויים נוספים ו-Cache-Control מפורש על התגובה, התוכן נשאר קפוא על תמונת מצב ישנה (כל מה
// שפורסם עד יום מסוים, כלום אחריו) - אז מוסיפים כאן את כל הדגלים המפורשים שיש ל-Next בשביל
// זה, לא רק את dynamic
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// GET - כל ההודעות המפורסמות בלוח המודעות, מהחדש לישן - ציבורי לגמרי (גם בלי להתחבר),
// כדי שגם מי שהגיע מהתראת פוש בלי חשבון יוכל לראות את התוכן
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('announcements')
    .select('id, title, content, created_at')
    .eq('published', true)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'שגיאה בשליפה' }, { status: 500 });

  // Cache-Control מפורש, לא רק dynamic='force-dynamic' - אחרת יש סיכוי שדפדפן/CDN בדרך עדיין
  // ישמור תגובה ישנה (בלי הודעה חדשה שזה עתה פורסמה) על בסיס היוריסטיקה שלו, לא רק על בסיס
  // ה-cache הפנימי של Next עצמו
  // s-maxage=0 בנוסף ל-no-store - מכוון במפורש גם ל-CDN/שכבת edge שבדרך (לא רק לדפדפן),
  // שעשוי להתייחס אליהם בנפרד
  return NextResponse.json({ announcements: data }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, s-maxage=0' } });
}
