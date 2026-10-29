// ההתקדמות נשמרת בדפדפן של המכשיר שעליו דור משחקת (localStorage) - בלי חשבון ובלי שרת.
// אם עוברים מכשיר / מנקים נתוני גלישה, ההתקדמות מתחילה מחדש.

import { CATCHES_TO_UNLOCK, WORLDS, type Word, type World } from './data';

export interface WordStat {
  right: number;
  wrong: number;
  said: number; // כמה פעמים אמרה את המילה בקול בהצלחה
  last: number;
}

export interface Progress {
  starter: number | null;
  caught: number[];
  stars: number;
  words: Record<string, WordStat>;
  days: string[]; // ימים ששיחקה (YYYY-MM-DD) - לרצף ולמסך ההורים
}

const KEY = 'dor-english-v1';

export const EMPTY: Progress = { starter: null, caught: [], stars: 0, words: {}, days: [] };

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch {}
  return EMPTY;
}

export function saveProgress(p: Progress) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function recordAnswer(p: Progress, word: string, correct: boolean, spoken = false): Progress {
  const s = p.words[word] || { right: 0, wrong: 0, said: 0, last: 0 };
  const next: WordStat = {
    right: s.right + (correct ? 1 : 0),
    wrong: s.wrong + (correct ? 0 : 1),
    said: s.said + (correct && spoken ? 1 : 0),
    last: Date.now(),
  };
  const days = p.days.includes(today()) ? p.days : [...p.days, today()];
  return { ...p, words: { ...p.words, [word]: next }, days };
}

export function isUnlocked(p: Progress, worldIndex: number) {
  if (worldIndex === 0) return true;
  const prev = WORLDS[worldIndex - 1];
  return prev.pokemon.filter((id) => p.caught.includes(id)).length >= CATCHES_TO_UNLOCK;
}

// מילה "ידועה" = ענתה נכון לפחות 3 פעמים, ונכון יותר מפי 3 ממספר הטעויות
export function isKnown(s?: WordStat) {
  return Boolean(s && s.right >= 3 && s.right >= s.wrong * 3);
}

// בוחר מילה לתרגול: מילים שקשות לה / שעוד לא ראתה מקבלות משקל גבוה יותר (חזרה מרווחת פשוטה).
// מדי פעם מערבב מילה מעולם קודם שכבר נפתח, כדי שלא תשכח.
export function pickWord(p: Progress, world: World, avoid: string[] = []): { word: Word; world: World } {
  const worldIndex = WORLDS.indexOf(world);
  let source = world;
  if (worldIndex > 0 && Math.random() < 0.2) {
    source = WORLDS[Math.floor(Math.random() * worldIndex)];
  }
  const pool = source.words.filter((w) => !avoid.includes(w.en));
  const list = pool.length ? pool : source.words;
  const weights = list.map((w) => {
    const s = p.words[w.en];
    if (!s) return 3;
    const hoursAgo = (Date.now() - s.last) / 36e5;
    return Math.max(0.4, 1 + s.wrong * 1.5 - Math.min(s.right, 6) * 0.25 + Math.min(hoursAgo / 24, 2));
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r <= 0) return { word: list[i], world: source };
  }
  return { word: list[list.length - 1], world: source };
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function distractors(world: World, target: Word, count: number): Word[] {
  return shuffle(world.words.filter((w) => w.en !== target.en)).slice(0, count);
}
