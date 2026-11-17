import { NextResponse } from 'next/server';
import { clean, isLeadValid, leadDetails, notifyShiran, readLead, sendToMonday } from '@/lib/businessLead';

// פנייה מטופס "לארגונים" (shirandimor.com/business): יוצרת פריט בלוח הלידים במאנדיי ושולחת מייל התראה לשירן.
// נפרד מ-/api/lead בכוונה: שם יש לוגיקה של קבוצת העדכונים (דילוג על מנויים קיימים, קישור הזמנה, עוגייה)
// שלא רלוונטית לפנייה של ארגון.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  }

  // שדה מלכודת לבוטים - נסתר מבני אדם. אם מולא, עונים "הצלחה" בלי לשמור כלום
  if (clean(body.website, 200)) {
    return NextResponse.json({ ok: true });
  }

  const lead = readLead(body);
  if (!isLeadValid(lead)) {
    return NextResponse.json({ error: 'חסרים שם, שם הארגון או מספר נייד תקין' }, { status: 400 });
  }

  const details = leadDetails(lead);
  const [monday, email] = await Promise.all([
    sendToMonday(lead, details).catch((e) => {
      console.error('שגיאה בשליחת פנייה מארגון ל-Monday.com', e);
      return false;
    }),
    notifyShiran(lead, details).catch((e) => {
      console.error('שגיאה בשליחת מייל התראה על פנייה מארגון', e);
      return false;
    }),
  ]);

  // אם גם מאנדיי וגם המייל נכשלו - הפנייה לא נשמרה בשום מקום, ולכן מחזירים שגיאה כדי שהטופס יציע וואטסאפ
  if (!monday && !email) {
    return NextResponse.json({ error: 'השליחה נכשלה' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, monday, email });
}
