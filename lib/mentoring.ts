// אזור הליווי האישי - טיפוסים ועזרים משותפים לצד התלמיד/ה (app/my-mentoring) ולצד הניהול
// (app/admin/mentoring). בלי קוד שרת - בטוח לייבוא מ-'use client'.
// הטבלאות: mentoring_students / mentoring_sessions / mentoring_trades / mentoring_tasks,
// עם RLS: כל תלמיד/ה רואה רק את שלו/ה, ו-trigger בבסיס הנתונים מונע מתלמיד/ה לשנות
// הערות/ציונים/אישורים של שירן. צילומי גרף נשמרים ב-bucket פרטי 'mentoring' תחת <user_id>/

export type MentoringStudent = {
  user_id: string;
  track_label: string;
  total_sessions: number;
  started_at: string;
  ends_at: string | null;
  goal: string | null;
  instruments: string | null;
  active: boolean;
};

export type MentoringSession = {
  id: string;
  student_id: string;
  lesson_number: number;
  title: string;
  held_at: string;
  video_url: string | null;
  summary: string | null;
  key_points: string[];
  seen_by_student: boolean;
  created_at: string;
};

export type Verdict = 'great' | 'good' | 'fix';

export type MentoringTrade = {
  id: string;
  student_id: string;
  traded_at: string;
  instrument: string;
  direction: 'long' | 'short';
  contracts: number;
  entry_price: number | null;
  stop_price: number | null;
  target_price: number | null;
  exit_price: number | null;
  pnl_usd: number | null;
  r_multiple: number | null;
  setup: string | null;
  entry_reason: string | null;
  exit_reason: string | null;
  followed_plan: boolean | null;
  emotion: string | null;
  discipline_score: number | null;
  lesson_learned: string | null;
  chart_paths: string[];
  coach_comment: string | null;
  coach_verdict: Verdict | null;
  reviewed_at: string | null;
  seen_by_student: boolean;
  created_at: string;
};

export type TaskStatus = 'open' | 'done' | 'approved' | 'returned';

export type MentoringTask = {
  id: string;
  student_id: string;
  title: string;
  details: string | null;
  due_date: string | null;
  session_id: string | null;
  trade_id: string | null;
  status: TaskStatus;
  student_note: string | null;
  coach_note: string | null;
  seen_by_student: boolean;
  done_at: string | null;
  created_at: string;
};

// שווי נקודה בדולרים לחוזה אחד - לחישוב אוטומטי של רווח/הפסד ו-R ביומן.
// "מניה" = מחיר * כמות (לשלב שבו נעבור גם למניות)
export const INSTRUMENTS: { code: string; label: string; pointValue: number }[] = [
  { code: 'MNQ', label: 'MNQ', pointValue: 2 },
  { code: 'NQ', label: 'NQ', pointValue: 20 },
  { code: 'MES', label: 'MES', pointValue: 5 },
  { code: 'ES', label: 'ES', pointValue: 50 },
  { code: 'MGC', label: 'MGC', pointValue: 10 },
  { code: 'STOCK', label: 'מניה', pointValue: 1 },
];

export function pointValue(instrument: string): number {
  return INSTRUMENTS.find((i) => i.code === instrument)?.pointValue ?? 1;
}

export const SETUP_OPTIONS = ['פריצה', 'פולבק', 'היפוך', 'פתיחת מסחר', 'טווח / VWAP', 'אחר'];
export const EMOTION_OPTIONS = ['רגוע/ה', 'ממוקד/ת', 'לחוץ/ה', 'FOMO', 'נקמה', 'משועמם/ת', 'בטוח/ה מדי'];

export const VERDICT_META: Record<Verdict, { label: string; icon: string; color: string }> = {
  great: { label: 'מעולה', icon: '🔥', color: 'var(--profit)' },
  good: { label: 'בכיוון', icon: '👍', color: 'var(--lavender)' },
  fix: { label: 'לתיקון', icon: '🛠️', color: 'var(--loss)' },
};

export const TASK_STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  open: { label: 'פתוחה', color: 'var(--sky)' },
  done: { label: 'ממתינה לאישור', color: 'var(--lavender)' },
  approved: { label: 'אושרה ✓', color: 'var(--profit)' },
  returned: { label: 'חזרה לתיקון', color: 'var(--loss)' },
};

// רווח/הפסד ו-R מחושבים מהמחירים. R = כמה "סיכונים" הרווחת/הפסדת (יציאה מול כניסה, ביחס למרחק לסטופ)
export function computeTradeNumbers(t: {
  instrument: string; direction: 'long' | 'short'; contracts: number;
  entry: number | null; stop: number | null; exit: number | null;
}): { pnl: number | null; r: number | null } {
  const { entry, stop, exit } = t;
  if (entry == null || exit == null || !Number.isFinite(entry) || !Number.isFinite(exit)) return { pnl: null, r: null };
  const sign = t.direction === 'short' ? -1 : 1;
  const points = (exit - entry) * sign;
  const pnl = Math.round(points * pointValue(t.instrument) * (t.contracts || 1) * 100) / 100;
  let r: number | null = null;
  if (stop != null && Number.isFinite(stop) && stop !== entry) {
    r = Math.round((points / Math.abs(entry - stop)) * 100) / 100;
  }
  return { pnl, r };
}

export function journalStats(trades: MentoringTrade[]) {
  const withPnl = trades.filter((t) => t.pnl_usd != null);
  const wins = withPnl.filter((t) => (t.pnl_usd as number) > 0).length;
  const net = withPnl.reduce((s, t) => s + (t.pnl_usd as number), 0);
  const withR = trades.filter((t) => t.r_multiple != null);
  const avgR = withR.length ? withR.reduce((s, t) => s + (t.r_multiple as number), 0) / withR.length : null;
  const planAnswered = trades.filter((t) => t.followed_plan != null);
  const planPct = planAnswered.length ? Math.round((planAnswered.filter((t) => t.followed_plan).length / planAnswered.length) * 100) : null;
  return {
    count: trades.length,
    winRate: withPnl.length ? Math.round((wins / withPnl.length) * 100) : null,
    net: Math.round(net),
    avgR: avgR == null ? null : Math.round(avgR * 100) / 100,
    planPct,
  };
}

// הקלטות מגוגל מיט נשמרות בדרייב של שירן. ממירים כל צורת לינק נפוצה (דרייב, יוטיוב, לום)
// לכתובת הטמעה. בדרייב - הקובץ צריך להיות משותף עם המייל של התלמיד/ה או "כל מי שיש לו קישור"
export function videoEmbedSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  try {
    const u = new URL(trimmed);
    if (u.hostname.includes('drive.google.com')) {
      const m = u.pathname.match(/\/file\/d\/([\w-]+)/);
      const id = m ? m[1] : u.searchParams.get('id');
      return id ? `https://drive.google.com/file/d/${id}/preview` : null;
    }
    if (u.hostname.includes('youtu.be')) return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v') || u.pathname.match(/\/(embed|shorts|live)\/([\w-]{11})/)?.[2];
      return v ? `https://www.youtube.com/embed/${v}` : null;
    }
    if (u.hostname.includes('loom.com')) return trimmed.replace('/share/', '/embed/');
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).find((p) => /^\d+$/.test(p));
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function daysLeft(endsAt: string | null): number | null {
  if (!endsAt) return null;
  const diff = new Date(endsAt + 'T23:59:59').getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
}

export function fmtUsd(n: number | null | undefined): string {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function fmtR(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n > 0 ? '+' : ''}${n}R`;
}

export type MentoringEvent =
  | 'trade_reviewed' | 'session_added' | 'task_added' | 'task_reviewed' // שירן ← לתלמיד/ה
  | 'trade_submitted' | 'task_done'; // תלמיד/ה ← לשירן
