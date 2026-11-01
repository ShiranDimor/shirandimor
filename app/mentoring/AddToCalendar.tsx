'use client';

import { buildGoogleCalendarUrl, buildIcsDataUri } from '@/lib/calendar';

const TITLE = 'שיחת התאמה לליווי אישי עם שירן דימור';
const MINUTES = 20;

// כפתורי "הוספה ליומן" (Google / קובץ לכל יומן אחר) - על בסיס העוזרים הקיימים של עמוד הלייבים
export default function AddToCalendar({ start, manageUrl }: { start: string; manageUrl?: string }) {
  const description = [
    'שיחת טלפון קצרה עם שירן - שירן מתקשרת אלייך.',
    manageUrl ? `צריך לשנות מועד או לבטל? ${manageUrl}` : '',
    'shirandimor.com/mentoring',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div className="mt-cal-actions">
      <a className="mt-cal-btn" href={buildGoogleCalendarUrl(TITLE, description, start, MINUTES)} target="_blank" rel="noopener noreferrer">
        הוספה ליומן Google
      </a>
      <a className="mt-cal-btn" href={buildIcsDataUri(TITLE, description, start, MINUTES)} download="shiran-call.ics">
        הוספה ליומן אחר (אייפון / אאוטלוק)
      </a>
    </div>
  );
}
