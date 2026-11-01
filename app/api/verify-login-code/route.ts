import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

// POST - מאמת קוד כניסה בן 6 ספרות שאנחנו הנפקנו בעצמנו (ר' lib/instantLogin.ts) מול
// login_codes, ואם תקין ולא נוצל/פג תוקף - מממש בפועל את ה-token_hash השמור מול Supabase
// (verifyOtp בצד השרת, עם הרשאת service role) ומחזיר ללקוח session אמיתי (access/refresh
// token) שהוא כבר יכול לשמור בעצמו עם supabase.auth.setSession - כדי שהאחסון (localStorage
// לעומת sessionStorage, לפי "השאר אותי מחובר") ייקבע נכון באותו דפדפן שבו המשתמש בפועל
export async function POST(request: Request) {
  const { email, code } = await request.json().catch(() => ({}));

  if (!email || !code) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedCode = String(code).trim();

  const { data: row, error: selectError } = await supabaseAdmin
    .from('login_codes')
    .select('id, token_hash, expires_at, used')
    .eq('email', normalizedEmail)
    .eq('code', normalizedCode)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectError || !row) {
    return NextResponse.json({ error: 'הקוד שגוי' }, { status: 400 });
  }
  if (row.used) {
    return NextResponse.json({ error: 'הקוד כבר נוצל - אפשר לבקש קוד חדש' }, { status: 400 });
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'הקוד פג תוקף - אפשר לבקש קוד חדש' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.auth.verifyOtp({ token_hash: row.token_hash, type: 'email' });

  if (error || !data.session) {
    console.error('verify-login-code: verifyOtp נכשל', error);
    return NextResponse.json({ error: 'הקוד שגוי או פג תוקף' }, { status: 400 });
  }

  // מסמנים נוצל רק אחרי הצלחה ודאית - כדי שניסיון שנכשל מסיבה אחרת לא "ישרוף" קוד תקין
  await supabaseAdmin.from('login_codes').update({ used: true }).eq('id', row.id);

  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user_id: data.user?.id,
  });
}
