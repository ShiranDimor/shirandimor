'use client';

import { buildGoogleCalendarUrl, buildIcsDataUri, buildInviteIcsDataUri } from '@/lib/calendar';

const TITLE = 'שיחת התאמה לליווי אישי עם שירן דימור';
const MINUTES = 20;

export type CalendarInfo = { eventLink: string; uid: string; organizer: string; sequence: number; attendee: string };

// כפתורי "הוספה ליומן" (Google / אייפון-אאוטלוק). כשיש פרטי האירוע האמיתי - שני הכפתורים מוסיפים את *אותו*
// אירוע של הזימון (Google: פתיחת האירוע עצמו; אחר: קובץ ics עם אותו מזהה), כך ששינוי מועד או ביטול
// מתעדכנים לבד גם ביומן של מי שקבע/ה. בלי הפרטים (גיבוי בלבד) - עותק רגיל כמו קודם.
export default function AddToCalendar({ start, manageUrl, calendar }: { start: string; manageUrl?: string; calendar?: CalendarInfo | null }) {
  const description = [
    'שיחת טלפון קצרה עם שירן - שירן מתקשרת אלייך.',
    manageUrl ? `צריך לשנות מועד או לבטל? ${manageUrl}` : '',
    'shirandimor.com/mentoring',
  ]
    .filter(Boolean)
    .join('\n');

  const googleHref = calendar?.eventLink || buildGoogleCalendarUrl(TITLE, description, start, MINUTES);
  const icsHref = calendar?.uid
    ? buildInviteIcsDataUri({ uid: calendar.uid, sequence: calendar.sequence, title: TITLE, description, start, minutes: MINUTES, organizer: calendar.organizer, attendee: calendar.attendee })
    : buildIcsDataUri(TITLE, description, start, MINUTES);

  return (
    <div className="mt-cal-actions">
      <a className="mt-cal-btn" href={googleHref} target="_blank" rel="noopener noreferrer">
        הוספה ליומן Google
      </a>
      <a className="mt-cal-btn" href={icsHref} download="shiran-call.ics">
        הוספה ליומן אחר (אייפון / אאוטלוק)
      </a>
    </div>
  );
}
