// חישוב זמנים פנויים לשיחות התאמה (עמוד לארגונים). כל ההגדרות כאן - לשינוי שעות/ימים משנים רק את הקבועים.
import type { BusyInterval } from './googleCalendar';

const TZ = 'Asia/Jerusalem';

export const CALL_CONFIG = {
  minutes: 15, // אורך שיחה
  stepMinutes: 30, // כל כמה זמן מתחילה שיחה אפשרית (10:00, 10:30...)
  bufferMinutes: 10, // מרווח מינימלי משיחות אחרות שנקבעו מהעמוד, לפני ואחרי
  days: [0, 1, 2, 3, 4], // ימים פעילים: 0=ראשון ... 4=חמישי (שישי ושבת חסומים תמיד)
  dayStart: '09:00', // השיחה הראשונה האפשרית
  dayEnd: '15:30', // עד מתי השיחה צריכה להסתיים (לפני פתיחת המסחר בארה"ב)
  lookaheadDays: 7, // כמה ימים קדימה מציגים (שבוע מתגלגל)
  minNoticeHours: 12, // התראה מינימלית לפני שיחה
};

export type Slot = { start: string; day: string; dayLabel: string; time: string };

function partsInTz(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}

function offsetMs(date: Date) {
  const p = partsInTz(date);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(date.getTime() / 1000) * 1000;
}

// שעה מקומית בישראל -> רגע אמיתי (UTC), כולל מעברי שעון קיץ/חורף
export function israelTimeToUtc(y: number, m: number, d: number, h: number, mi: number) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - offsetMs(new Date(guess));
  const second = guess - offsetMs(new Date(t));
  if (second !== t) t = second;
  return new Date(t);
}

const dayLabelFmt = new Intl.DateTimeFormat('he-IL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function formatSlotForHumans(date: Date) {
  return `${dayLabelFmt.format(date)} בשעה ${timeFmt.format(date)}`;
}

export function slotRange(now = new Date()) {
  return { timeMin: now, timeMax: new Date(now.getTime() + (CALL_CONFIG.lookaheadDays + 1) * 24 * 3600 * 1000) };
}

export function computeSlots(busy: BusyInterval[], now = new Date()): Slot[] {
  const { minutes, stepMinutes, bufferMinutes, days, dayStart, dayEnd, lookaheadDays, minNoticeHours } = CALL_CONFIG;
  const [sh, sm] = dayStart.split(':').map(Number);
  const [eh, em] = dayEnd.split(':').map(Number);
  const earliest = now.getTime() + minNoticeHours * 3600 * 1000;
  const buffer = bufferMinutes * 60 * 1000;
  const today = partsInTz(now);
  const slots: Slot[] = [];

  for (let i = 0; i <= lookaheadDays; i++) {
    const base = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    const y = base.getUTCFullYear();
    const m = base.getUTCMonth() + 1;
    const d = base.getUTCDate();
    if (!days.includes(base.getUTCDay())) continue;
    const dayKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    for (let mins = sh * 60 + sm; mins + minutes <= eh * 60 + em; mins += stepMinutes) {
      const start = israelTimeToUtc(y, m, d, Math.floor(mins / 60), mins % 60);
      const s = start.getTime();
      const e = s + minutes * 60 * 1000;
      if (s < earliest) continue;
      const clashes = busy.some((b) => b.start < e + buffer && b.end > s - buffer);
      if (clashes) continue;
      slots.push({ start: start.toISOString(), day: dayKey, dayLabel: dayLabelFmt.format(start), time: timeFmt.format(start) });
    }
  }
  return slots;
}
