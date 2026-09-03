import { NextResponse } from 'next/server';
import { sendLoginEmail } from '@/lib/instantLogin';
import { ensureActiveSubscriberAccount, isActiveSubscriber } from '@/lib/subscriberStatus';
import { isContactInSubscribersGroupMonday, syncGenericLead } from '@/lib/tradingPlan/monday';

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
    if (!found) {
      // מנוי/ה אמיתי/ת לא צריך/ה לחזור כליד - בודקים גם מול טבלת המנויים באתר (isActiveSubscriber),
      // לא רק מול הבדיקה הספציפית הזו של מאנדיי, כדי לא ליצור ליד מיותר למישהו/י שכבר מנוי/ה
      // בפועל (למשל אם הטלפון/מייל שלו/ה במאנדיי לא תואמים בדיוק מסיבה כלשהי)
      const alreadySubscriber = await isActiveSubscriber(phone, email);

      // מישהו/י שניסה/תה להתחבר כמנוי/ה אבל הפרטים לא נמצאו במאנדיי - זה עלול להיות אי-התאמת
      // נתונים אמיתית (למשל טלפון שונה ממה שרשום) או מישהו/י שחושב/ת בטעות שהוא/היא מנוי/ה.
      // בלי הסנכרון הזה הפרטים היו פשוט נעלמים בלי שום תיעוד
      if (!alreadySubscriber) await syncGenericLead({
        phone,
        email,
        name: fullName,
        source: 'ניסיון התחברות - לא נמצא/ה במאנדיי',
        note: `ניסה/תה להתחבר כמנוי/ה בעמוד ההתחברות, אבל הטלפון/מייל לא נמצאו בקבוצת הסוחרים במאנדיי. ייתכן שזו אי-התאמת פרטים אמיתית שכדאי לבדוק.`,
      }).catch((e) => console.error('שגיאה בסנכרון ליד מניסיון התחברות שנכשל', e));

      return NextResponse.json({ verified: false, configured: true });
    }

    await ensureActiveSubscriberAccount(email, phone, fullName);
    await sendLoginEmail(email);

    return NextResponse.json({ verified: true, configured: true });
  } catch (e) {
    console.error('שגיאה באימות מול Monday.com', e);
    return NextResponse.json({ verified: false, configured: false });
  }
}
