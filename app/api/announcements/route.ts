import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

// ה-route הזה היה הפוך-GET-בלי-request היחיד באתר (ראה business-call/slots) בלי dynamic
// מפורש - Next App Router מזהה route כזה (בלי headers/cookies/searchParams) כסטטי לגמרי
// ומקפיא אותו ב-build/deploy. זה בדיוק מה שגרם לכך שהודעה חדשה הופיעה בפעמון (push, לא
// עובר דרך ה-route הזה) אבל לא בלוח /announcements עד הדיפלוי הבא
export const dynamic = 'force-dynamic';

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
  return NextResponse.json({ announcements: data }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
}
