import { NextResponse } from 'next/server';
import { isActiveSubscriber } from '@/lib/subscriberStatus';
import { syncGenericLead } from '@/lib/tradingPlan/monday';
import { supabaseAdmin } from '@/lib/instantLogin';
import { isPhoneBlocked } from '@/lib/blockedContacts';

const TRIAL_SOURCE_LABEL = 'ימי ניסיון - עדכונים (7 ימים)';
// דף הנחיתה של קמפיין חודש הניסיון בתשלום סמלי (app/join) - מסומן בנפרד כדי שבמאנדיי ובמייל
// ההתראה יהיה ברור מאיזה מסלול הגיע הליד
const TRIAL_MONTH_SOURCE_LABEL = 'חודש ניסיון - דף נחיתה (קמפיין)';

// מייל התראה ישיר לשירן, בלי תלות בהתראות של מאנדיי עצמו - מאנדיי לא שולח התראה אוטומטית
// על כרטיס שנוצר דרך ה-API (רק על פעולות שנעשות ידנית באפליקציה, או דרך אוטומציה שהוגדרה
// בלוח), אז זו הדרך היחידה שמבטיחה שהיא תדע על ההרשמה מיד, גם אם הסנכרון למאנדיי עצמו נכשל
async function notifyNewTrialSignup(name: string, phone: string, isTrialMonth: boolean) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY לא מוגדר - לא ניתן לשלוח מייל התראה על הרשמת ניסיון');
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: 'התראות האתר <noreply@shirandimor.com>',
        to: 'shiran@shirandimor.com',
        subject: isTrialMonth ? 'ליד חדש לחודש ניסיון (דף הנחיתה)' : 'הרשמה חדשה ל-7 ימי ניסיון',
        text: isTrialMonth
          ? `ליד חדש מדף הנחיתה של חודש הניסיון (shirandimor.com/join).\nהליד הועבר לתשלום - אם לא שילם תוך יום, כדאי לחזור אליו.\n\nשם: ${name}\nנייד: ${phone}\n\nלרשימת הנרשמים: https://www.shirandimor.com/admin/trial-signups`
          : `מישהו/י נרשם/ה ל-7 ימי ניסיון.\n\nשם: ${name}\nנייד: ${phone}\n\nלרשימת הנרשמים: https://www.shirandimor.com/admin/trial-signups`,
      }),
    });
    if (!res.ok) console.error('שגיאה בשליחת מייל התראה על הרשמת ניסיון', await res.text());
  } catch (e) {
    console.error('שגיאה בשליחת מייל התראה על הרשמת ניסיון', e);
  }
}

// דף הרשמה לסבב "7 ימי ניסיון" ששירן שולחת לקבוצת העדכונים. syncGenericLead תמיד יוצר כרטיס
// חדש וברור בלידים חדשים (forceNew) - ואם המספר כבר קיים במקום אחר בלוח, הוא מסמן את הכרטיס
// כ"ליד כפול" במקום ליצור אותו כליד רגיל, כך ששירן יודעת מיד שזה מישהו מוכר
export async function POST(request: Request) {
  const { name, phone, offer } = await request.json();
  const isTrialMonth = offer === 'trial_month';

  if (!name || !phone) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  // מנוי משלם קיים כבר יש לו גישה מלאה - אין טעם לרשום אותו לליד של ניסיון חינם
  const alreadySubscriber = await isActiveSubscriber(phone, undefined).catch(() => false);
  if (alreadySubscriber) {
    return NextResponse.json({ ok: true, alreadySubscriber: true });
  }

  // איש קשר חסום - מגיב כהרשמה רגילה (בלי לחשוף שהוא חסום) אבל לא שומר ולא יוצר שום ליד
  if (await isPhoneBlocked(phone)) {
    return NextResponse.json({ ok: true });
  }

  const { data: signup, error: insertError } = await supabaseAdmin
    .from('trial_signups')
    .insert({ name, phone })
    .select('id')
    .single();

  if (insertError) {
    console.error('שגיאה בשמירת הרשמת ניסיון', insertError);
  }

  await notifyNewTrialSignup(name, phone, isTrialMonth);

  const mondayResult = await syncGenericLead({
    phone,
    name,
    source: isTrialMonth ? TRIAL_MONTH_SOURCE_LABEL : TRIAL_SOURCE_LABEL,
    note: isTrialMonth
      ? `השאיר/ה פרטים בדף הנחיתה של חודש הניסיון והועבר/ה לתשלום\nנייד: ${phone}`
      : `נרשם/ה ל-7 ימי ניסיון דרך דף ההרשמה\nנייד: ${phone}`,
    // תמיד כרטיס חדש בלידים חדשים - גם אם המספר כבר קיים בקבוצת העדכונים (וזה בדיוק המצב
    // הנפוץ כאן, כי המבצע נשלח למי שכבר בעדכונים) - עדיין יסומן "ליד כפול" אם צריך
    forceNew: true,
  });

  if (mondayResult.ok && signup) {
    await supabaseAdmin.from('trial_signups').update({ monday_synced: true }).eq('id', signup.id);
  }
  if (!mondayResult.ok) {
    console.error('שגיאה בסנכרון הרשמת ניסיון ל-Monday.com', mondayResult.reason);
  }

  return NextResponse.json({ ok: true, monday: mondayResult.ok });
}
