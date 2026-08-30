import { NextResponse } from 'next/server';
import { isActiveSubscriber } from '@/lib/subscriberStatus';
import { findContact, upsertContact, addNote } from '@/lib/crm';

// קישור ההצטרפות בפועל לקבוצת הוואטסאפ החינמית - נשמר כאן (קוד צד-שרת) ולא בעמוד עצמו,
// כדי שלא יהיה חשוף בקוד הציבורי שנשלח לדפדפן: מי שרק פותח את מקור הדף לא יכול "לגנוב" את
// הקישור ולהצטרף לקבוצה בלי להשאיר פרטים - הוא נחשף רק בתגובת ה-API אחרי שליחה אמיתית של הטופס
const WHATSAPP_FREE_GROUP_INVITE_URL = process.env.WHATSAPP_FREE_GROUP_INVITE_URL || 'https://chat.whatsapp.com/GEf9Y4vFRDSEWKixrETWcg';
const SOURCE_LABEL = 'טופס הצטרפות לקבוצת העדכונים באתר';
const DUPLICATE_STATUS_LABEL = 'ליד כפול';

export async function POST(request: Request) {
  const { name, phone, email } = await request.json();

  if (!name || !phone) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  // מי שכבר מנוי פעיל לא צריך להצטרף לקבוצת העדכונים - הוא כבר מקבל את כל מה שיש שם ועוד הרבה
  // יותר. בלי הבדיקה הזו כל הרשמה כזו יוצרת ליד מיותר ב-CRM שצריך לזהות ולמחוק ידנית
  const isSubscriber = await isActiveSubscriber(phone, email);
  if (isSubscriber) {
    return NextResponse.json({ ok: true, alreadySubscriber: true });
  }

  try {
    // כבר קיים איש קשר אחר עם אותו נייד/מייל (למשל מ"תוכנית מסחר" או הרשמה קודמת) - מסמנים
    // בהערה, לא חוסמים את יצירת/עדכון הרשומה עצמה
    const isDuplicate = !!(await findContact(phone, email));

    const contact = await upsertContact({
      phone,
      email,
      fullName: name,
      stage: 'updates_group',
      source: SOURCE_LABEL,
      statusLabel: isDuplicate ? DUPLICATE_STATUS_LABEL : undefined,
    });

    await addNote(
      contact.id,
      `נייד: ${phone}${email ? `\nאימייל: ${email}` : ''}\nמקור: ${SOURCE_LABEL}${isDuplicate ? '\n⚠ כבר היה איש קשר קודם עם אותו נייד/מייל - סומן כ"ליד כפול"' : ''}`
    );

    const response = NextResponse.json({ ok: true, crm: true, inviteUrl: WHATSAPP_FREE_GROUP_INVITE_URL });
    // מסמן את הדפדפן כמי שהצטרף לקבוצת העדכונים - פותח גישה לשכבת התוכן האמצעית בספריית השיעורים
    response.cookies.set('sd_registered', '1', { maxAge: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax' });
    return response;
  } catch (e) {
    console.error('שגיאה בשמירת הליד ב-CRM', e);
    const response = NextResponse.json({ ok: true, crm: false, inviteUrl: WHATSAPP_FREE_GROUP_INVITE_URL });
    response.cookies.set('sd_registered', '1', { maxAge: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax' });
    return response;
  }
}
