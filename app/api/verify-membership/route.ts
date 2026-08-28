import { NextResponse } from 'next/server';
import { sendLoginEmail, supabaseAdmin } from '@/lib/instantLogin';
import { ensureActiveSubscriberAccount } from '@/lib/subscriberStatus';
import { isContactInSubscribersGroupMonday } from '@/lib/tradingPlan/monday';

// רישום אבחוני זמני - יש להסיר יחד עם טבלת public._debug_verify_attempts אחרי סיום האבחון
async function logDebugAttempt(fields: Record<string, unknown>) {
  await supabaseAdmin.from('_debug_verify_attempts').insert(fields).then(
    () => {},
    () => {}
  );
}

// אימות מול "קבוצת סוחרים" במאנדיי - משתמש בפונקציה המשותפת שכבר בודקת גם טלפון וגם מייל
// (במקום מימוש נפרד שבדק רק טלפון, וטעה לפספס מנוי שהטלפון שלו במאנדיי לא תואם בדיוק
// אבל המייל כן קיים ותואם)
export async function POST(request: Request) {
  const { phone, email, firstName, lastName } = await request.json();

  if (!phone || !email || !firstName || !lastName) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  const hebrewNamePattern = /^[א-ת\s'-]+$/;
  if (!hebrewNamePattern.test(firstName) || !hebrewNamePattern.test(lastName)) {
    return NextResponse.json({ error: 'שם פרטי ושם משפחה חייבים להיות בעברית' }, { status: 400 });
  }

  const fullName = `${firstName} ${lastName}`.trim();

  if (!process.env.MONDAY_API_TOKEN || !process.env.MONDAY_BOARD_ID) {
    console.error('Monday.com לא מוגדר - לא ניתן לאמת מנוי');
    return NextResponse.json({ verified: false, configured: false });
  }

  try {
    const found = await isContactInSubscribersGroupMonday(phone, email);
    await logDebugAttempt({ phone, email, first_name: firstName, last_name: lastName, found });
    if (!found) {
      return NextResponse.json({ verified: false, configured: true });
    }

    await ensureActiveSubscriberAccount(email, phone, fullName);
    await sendLoginEmail(email);

    return NextResponse.json({ verified: true, configured: true });
  } catch (e) {
    console.error('שגיאה באימות מול Monday.com', e);
    await logDebugAttempt({ phone, email, first_name: firstName, last_name: lastName, err: String(e) });
    return NextResponse.json({ verified: false, configured: false });
  }
}
