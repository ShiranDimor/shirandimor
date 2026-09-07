import { NextResponse } from 'next/server';
import { isActiveSubscriber } from '@/lib/subscriberStatus';
import { syncGenericLead } from '@/lib/tradingPlan/monday';
import { supabaseAdmin } from '@/lib/instantLogin';

const TRIAL_SOURCE_LABEL = 'ימי ניסיון - עדכונים (7 ימים)';

// דף הרשמה לסבב "7 ימי ניסיון" ששירן שולחת לקבוצת העדכונים - syncGenericLead דואג בעצמו
// שאם הליד כבר קיים במאנדיי (למשל כבר בקבוצת העדכונים) הוא רק יקבל הערה על ההרשמה במקום
// ליצור כפילות, וזה בדיוק מה שנותן לשירן את המעקב שהיא ביקשה
export async function POST(request: Request) {
  const { name, phone } = await request.json();

  if (!name || !phone) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  // מנוי משלם קיים כבר יש לו גישה מלאה - אין טעם לרשום אותו לליד של ניסיון חינם
  const alreadySubscriber = await isActiveSubscriber(phone, undefined).catch(() => false);
  if (alreadySubscriber) {
    return NextResponse.json({ ok: true, alreadySubscriber: true });
  }

  const [mondayResult] = await Promise.all([
    syncGenericLead({
      phone,
      name,
      source: TRIAL_SOURCE_LABEL,
      note: `נרשם/ה ל-7 ימי ניסיון דרך דף ההרשמה\nנייד: ${phone}`,
    }),
    // נשמר גם בטבלה משלנו כדי שיהיה אפשר לראות את כל הנרשמים לסבב הזה בעמוד הניהול באתר,
    // לא רק במאנדיי
    supabaseAdmin.from('trial_signups').insert({ name, phone }).then(({ error }) => {
      if (error) console.error('שגיאה בשמירת הרשמת ניסיון', error);
    }),
  ]);

  if (!mondayResult.ok) {
    console.error('שגיאה בסנכרון הרשמת ניסיון ל-Monday.com', mondayResult.reason);
  }

  return NextResponse.json({ ok: true, monday: mondayResult.ok });
}
