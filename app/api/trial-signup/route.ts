import { NextResponse } from 'next/server';
import { isActiveSubscriber } from '@/lib/subscriberStatus';
import { syncGenericLead } from '@/lib/tradingPlan/monday';
import { supabaseAdmin } from '@/lib/instantLogin';

const TRIAL_SOURCE_LABEL = 'ימי ניסיון - עדכונים (7 ימים)';

// דף הרשמה לסבב "7 ימי ניסיון" ששירן שולחת לקבוצת העדכונים. syncGenericLead תמיד יוצר כרטיס
// חדש וברור בלידים חדשים (forceNew) - ואם המספר כבר קיים במקום אחר בלוח, הוא מסמן את הכרטיס
// כ"ליד כפול" במקום ליצור אותו כליד רגיל, כך ששירן יודעת מיד שזה מישהו מוכר
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

  const { data: signup, error: insertError } = await supabaseAdmin
    .from('trial_signups')
    .insert({ name, phone })
    .select('id')
    .single();

  if (insertError) {
    console.error('שגיאה בשמירת הרשמת ניסיון', insertError);
  }

  const mondayResult = await syncGenericLead({
    phone,
    name,
    source: TRIAL_SOURCE_LABEL,
    note: `נרשם/ה ל-7 ימי ניסיון דרך דף ההרשמה\nנייד: ${phone}`,
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
