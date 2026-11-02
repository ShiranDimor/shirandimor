// עוזרים ל"הוספה ליומן" - בלי תלות בשרת, רק בונים קישור/קובץ מהנתונים שכבר יש בדפדפן.
// משך ברירת מחדל של אירוע: שעה אחת, כי לטבלת הלייבים אין שעת סיום נפרדת.
const DEFAULT_DURATION_MINUTES = 60;

function toIcsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export function buildGoogleCalendarUrl(title: string, description: string, scheduledAtIso: string, durationMinutes = DEFAULT_DURATION_MINUTES): string {
  const start = new Date(scheduledAtIso);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const dates = `${toIcsDate(start.toISOString())}/${toIcsDate(end.toISOString())}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates,
    details: description || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildIcsDataUri(title: string, description: string, scheduledAtIso: string, durationMinutes = DEFAULT_DURATION_MINUTES): string {
  const start = new Date(scheduledAtIso);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const escape = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//shirandimor.com//lives//HE',
    'BEGIN:VEVENT',
    `UID:${start.getTime()}@shirandimor.com`,
    `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
    `DTSTART:${toIcsDate(start.toISOString())}`,
    `DTEND:${toIcsDate(end.toISOString())}`,
    `SUMMARY:${escape(title)}`,
    description ? `DESCRIPTION:${escape(description)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

// קובץ ics שמייצג את *אותו* אירוע כמו הזימון שגוגל שלחה (אותו UID ומארגן) - יומן אפל/אאוטלוק מזהים אותו
// כזימון, ומיילי העדכון של גוגל (שינוי מועד/ביטול) מעדכנים אותו אוטומטית במקום להשאיר עותק תקוע
export function buildInviteIcsDataUri(opts: {
  uid: string;
  sequence: number;
  title: string;
  description: string;
  start: string;
  minutes: number;
  organizer: string;
  attendee?: string;
}): string {
  const start = new Date(opts.start);
  const end = new Date(start.getTime() + opts.minutes * 60 * 1000);
  const escape = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//shirandimor.com//mentoring//HE',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `SEQUENCE:${opts.sequence}`,
    `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
    `DTSTART:${toIcsDate(start.toISOString())}`,
    `DTEND:${toIcsDate(end.toISOString())}`,
    `SUMMARY:${escape(opts.title)}`,
    opts.description ? `DESCRIPTION:${escape(opts.description)}` : '',
    opts.organizer ? `ORGANIZER;CN=שירן דימור:mailto:${opts.organizer}` : '',
    opts.attendee ? `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${opts.attendee}` : '',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  return `data:text/calendar;charset=utf-8;method=REQUEST,${encodeURIComponent(ics)}`;
}
