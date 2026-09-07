// כל התאריכים נשמרים בשרת כ-UTC (timestamptz) - הקובץ הזה אחראי להמיר לתצוגה לפי Asia/Jerusalem
// (בלי תלות באיזור הזמן של הדפדפן שמציג), ולפרש קלט משעון קיר של ירושלים בחזרה ל-UTC תקין -
// גם בשעון קיץ וגם בשעון חורף.

export const JERUSALEM_TZ = 'Asia/Jerusalem';

// ההפרש (בדקות) בין שעון הקיר של איזור הזמן הנתון לבין UTC, ברגע נתון - טכניקה סטנדרטית:
// מציגים את אותו רגע UTC כשעון קיר באיזור הזמן, ומשווים למה שהוא היה אילו היה UTC עצמו
function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return (asUtc - date.getTime()) / 60000;
}

// ממיר "YYYY-MM-DDTHH:mm" (כמו שמגיע מ-<input type="datetime-local">) בהנחה שזה שעון קיר
// של ירושלים - ל-ISO string תקין ב-UTC לשמירה בבסיס הנתונים
export function jerusalemLocalInputToUtcIso(localValue: string): string | null {
  if (!localValue) return null;
  const naiveUtcMs = Date.parse(`${localValue}:00Z`);
  if (Number.isNaN(naiveUtcMs)) return null;

  // איטרציה כפולה כדי לטפל נכון גם ברגעי מעבר שעון קיץ/חורף עצמם
  const offset1 = getTimeZoneOffsetMinutes(new Date(naiveUtcMs), JERUSALEM_TZ);
  const utcMs1 = naiveUtcMs - offset1 * 60000;
  const offset2 = getTimeZoneOffsetMinutes(new Date(utcMs1), JERUSALEM_TZ);
  const utcMs2 = naiveUtcMs - offset2 * 60000;

  return new Date(utcMs2).toISOString();
}

// הכיוון ההפוך - מתאריך UTC שמור, לערך שמתאים לשדה <input type="datetime-local"> ומציג
// את שעון הקיר הנכון של ירושלים (לא של הדפדפן שמציג)
export function utcIsoToJerusalemLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: JERUSALEM_TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = dtf.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function formatDateTimeIL(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('he-IL', {
    timeZone: JERUSALEM_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateIL(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('he-IL', {
    timeZone: JERUSALEM_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatTimeIL(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('he-IL', {
    timeZone: JERUSALEM_TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
}

function jerusalemDateKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: JERUSALEM_TZ });
}

export function isOverdue(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

export function isTodayJerusalem(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return jerusalemDateKey(new Date(iso)) === jerusalemDateKey(new Date());
}

// גבולות "היום" לפי לוח השנה של ירושלים, מבוטאים כ-UTC ISO - לשימוש בסינון "Follow-up היום"
export function getJerusalemTodayBoundsUtc(): { startIso: string; endIso: string } {
  const now = new Date();
  const todayKey = jerusalemDateKey(now); // "YYYY-MM-DD"
  const startIso = jerusalemLocalInputToUtcIso(`${todayKey}T00:00`)!;

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowKey = jerusalemDateKey(tomorrow);
  const endIso = jerusalemLocalInputToUtcIso(`${tomorrowKey}T00:00`)!;

  return { startIso, endIso };
}
