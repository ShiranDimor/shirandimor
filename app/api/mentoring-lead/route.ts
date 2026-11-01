import { NextResponse } from 'next/server';
import { clean, notifyShiran, sendToMonday } from '@/lib/businessLead';
import {
  MENTORING_GROUP_NAME,
  MENTORING_SOURCE_LABEL,
  isMentoringLeadValid,
  mentoringLeadDetails,
  readMentoringLead,
} from '@/lib/mentoringLead';

// השאלון שלפני שיחת ההתאמה בעמוד הליווי האישי (shirandimor.com/mentoring): יוצר ליד במאנדיי ומייל התראה לשירן.
// נשמר כבר בשלב הזה (לפני בחירת זמן ביומן) - כדי שגם מי שלא סיים/ה לקבוע שיחה לא ילך לאיבוד.
// מחזיר את מזהה הפריט במאנדיי, כדי שקביעת השיחה אחר כך תתווסף לאותו פריט ולא תיצור ליד כפול.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  }

  // שדה מלכודת לבוטים
  if (clean(body.website, 200)) {
    return NextResponse.json({ ok: true, leadId: '' });
  }

  const lead = readMentoringLead(body);
  if (!isMentoringLeadValid(lead)) {
    return NextResponse.json({ error: 'חסרים שם, נייד תקין או מייל' }, { status: 400 });
  }

  const details = mentoringLeadDetails(lead, ['מילא/ה שאלון לשיחת התאמה (עדיין לא נקבע זמן ביומן)']);
  const [monday, email] = await Promise.all([
    sendToMonday(lead as unknown as Record<string, string>, details, {
      groupNames: [MENTORING_GROUP_NAME],
      sourceLabel: MENTORING_SOURCE_LABEL,
      itemName: `${lead.name} - ליווי אישי`,
    }).catch((e) => {
      console.error('שגיאה בשליחת ליד ליווי אישי ל-Monday.com', e);
      return false as const;
    }),
    notifyShiran(lead as unknown as Record<string, string>, details, `ליד חדש לליווי אישי: ${lead.name}`, 'מישהו/י מילא/ה את השאלון לשיחת התאמה בעמוד הליווי האישי.').catch((e) => {
      console.error('שגיאה בשליחת מייל התראה על ליד ליווי אישי', e);
      return false;
    }),
  ]);

  if (!monday && !email) {
    return NextResponse.json({ error: 'השליחה נכשלה' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, leadId: monday || '' });
}
