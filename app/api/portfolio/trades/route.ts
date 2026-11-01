import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { hasActiveEntitlement } from '@/lib/entitlement';

export const dynamic = 'force-dynamic';

async function checkFullAccess(request: Request): Promise<boolean> {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return false;

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return false;

  const { data: profile } = await supabaseAdmin.from('profiles').select('role, subscription_status, subscription_paid_until').eq('id', user.id).maybeSingle();
  return hasActiveEntitlement(profile);
}

// GET - נתוני התיק הציבורי (/portfolio, עמוד הבית) - מחליף קריאה ישירה מהדפדפן לטבלת trades
// (שהייתה חשופה במדיניות RLS ציבורית לגמרי, qual=true - כל מי שיודע את ה-anon key הציבורי
// יכול היה לקרוא גם סימבולים אמיתיים של עסקאות פתוחות, בלי שום קשר למנוי בפועל; הטשטוש
// ב-UI היה קוסמטי בלבד). כאן הזכאות נבדקת בצד השרת מול הטוקן המאומת, וסימבול של עסקה
// פתוחה מוסתר בפועל למי שאינו זכאי - לא רק מוסתר ויזואלית. עסקאות סגורות (היסטוריה) נשארות
// גלויות במלואן לכולם, בדיוק כמו שהיה נגיש גם קודם בלוח השנה הציבורי - לא שינוי התנהגות שם
export async function GET(request: Request) {
  const hasFullAccess = await checkFullAccess(request).catch(() => false);

  const { searchParams } = new URL(request.url);
  const closedLimitParam = searchParams.get('closedLimit');
  const closedLimit = closedLimitParam ? parseInt(closedLimitParam, 10) : null;

  let closedQuery = supabaseAdmin.from('trades').select('*').eq('status', 'closed').order('closed_at', { ascending: false });
  if (closedLimit && Number.isFinite(closedLimit)) closedQuery = closedQuery.limit(closedLimit);

  const [{ data: open, error: openError }, { data: closed, error: closedError }, { data: settings, error: settingsError }] = await Promise.all([
    supabaseAdmin.from('trades').select('*').eq('status', 'open').order('opened_at', { ascending: false }),
    closedQuery,
    supabaseAdmin.from('portfolio_settings').select('initial_balance').eq('id', 1).single(),
  ]);

  if (openError) console.error('portfolio/trades: שגיאה בשליפת עסקאות פתוחות', openError);
  if (closedError) console.error('portfolio/trades: שגיאה בשליפת עסקאות סגורות', closedError);
  if (settingsError) console.error('portfolio/trades: שגיאה בשליפת הגדרות תיק', settingsError);

  // כישלון בשתי השאילתות העיקריות (לא רק settings, שאופציונלי) הוא כנראה תקלת רשת/שרת
  // אמיתית - מחזירים שגיאה אמיתית במקום 200 עם מערכים ריקים, כדי שהלקוח (portfolio/page.tsx,
  // app/page.tsx) יידע להבדיל בין "אין עדיין עסקאות" לבין "לא הצלחנו לטעון בכלל" ויציג
  // הודעת שגיאה אמיתית במקום תיק ריק שקט
  if (openError && closedError) {
    return NextResponse.json({ error: 'שגיאה בטעינת נתוני התיק' }, { status: 500 });
  }

  // placeholder באורך זהה לסימבול האמיתי, לא null - כדי ש-.trade-symbol.blurred (CSS blur)
  // ימשיך להציג טקסט מטושטש כמו קודם, ולא שדה ריק
  const maskedOpen = (open || []).map((t) =>
    hasFullAccess ? t : { ...t, symbol: '•'.repeat(Math.max(3, (t.symbol || '').length)) }
  );

  return NextResponse.json({
    open: maskedOpen,
    closed: closed || [],
    initialBalance: settings ? Number(settings.initial_balance) : null,
    hasFullAccess,
  });
}
