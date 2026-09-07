import { NextResponse } from 'next/server';
import { syncSalesLeadsFromMonday } from '@/lib/salesLeads/mondaySync';

// Webhook קבלה ממאנדיי - לשימוש אופציונלי אם בעתיד תרצי לחבר Automation/Webhook בלוח שיצביע
// לכתובת הזו (למשל ב"create_item" או "item_moved_to_group"). לא חובה בכלל להשתמש בזה -
// הסנכרון התקופתי (app/api/cron/sales-leads-sync) כבר רץ כל 15 דקות ומספיק לבד.
//
// מאנדיי שולח קודם בקשת "challenge" חד-פעמית כדי לאמת את הכתובת בזמן יצירת ה-Webhook -
// וחייבים להחזיר בדיוק את אותו ה-challenge בחזרה כדי שהחיבור יאושר.
// אם MONDAY_WEBHOOK_SECRET מוגדר, דורשים אותו כפרמטר ?secret= בכתובת שנרשמת במאנדיי - אחרת
// מקבלים כל קריאה (הנזק המקסימלי מקריאה מזויפת הוא סנכרון מיותר, לא חשיפת מידע)
export async function POST(request: Request) {
  const secret = process.env.MONDAY_WEBHOOK_SECRET;
  if (secret) {
    const provided = new URL(request.url).searchParams.get('secret');
    if (provided !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  if (body?.challenge) {
    return NextResponse.json({ challenge: body.challenge });
  }

  try {
    const result = await syncSalesLeadsFromMonday();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('שגיאה בסנכרון לידי מכירות מ-Webhook של מאנדיי', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בסנכרון' }, { status: 500 });
  }
}
