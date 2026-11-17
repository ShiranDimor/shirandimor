// דיבור והקשבה דרך הדפדפן עצמו (Web Speech API) - בלי שרת ובלי עלות.
// הקראה (speechSynthesis) עובדת כמעט בכל מכשיר. זיהוי דיבור עובד בכרום ובספארי (אייפד/אייפון),
// ובדפדפנים אחרים המשחק עובר למצב "אמרתי!" שבו מבוגר/ת מאשר/ת שהילדה אמרה את המילה.

let enVoice: SpeechSynthesisVoice | null = null;
let heVoice: SpeechSynthesisVoice | null = null;

function pickVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const voices = window.speechSynthesis.getVoices();
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  // עדיפות לקולות "טבעיים"/של גוגל/סמנתה שנשמעים פחות רובוטיים, ובאנגלית אמריקאית
  enVoice =
    en.find((v) => /natural|samantha|google us english|aria|jenny/i.test(v.name)) ||
    en.find((v) => v.lang === 'en-US') ||
    en[0] ||
    null;
  heVoice = voices.find((v) => v.lang.toLowerCase().startsWith('he') || v.lang.toLowerCase().startsWith('iw')) || null;
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  pickVoices();
  window.speechSynthesis.onvoiceschanged = pickVoices;
}

export function speak(text: string, opts: { lang?: 'en' | 'he'; rate?: number } = {}): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return resolve();
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const isHe = opts.lang === 'he';
    u.lang = isHe ? 'he-IL' : 'en-US';
    const voice = isHe ? heVoice : enVoice;
    if (voice) u.voice = voice;
    u.rate = opts.rate ?? (isHe ? 1 : 0.85);
    u.pitch = isHe ? 1 : 1.1;
    // בחלק מהדפדפנים onend לא נקרא אף פעם - רשת ביטחון לפי אורך הטקסט כדי שהמשחק לא ייתקע
    const fallback = setTimeout(resolve, 1500 + text.length * 110);
    u.onend = () => { clearTimeout(fallback); resolve(); };
    u.onerror = () => { clearTimeout(fallback); resolve(); };
    synth.speak(u);
  });
}

export interface Line {
  lang: 'en' | 'he';
  text: string;
}
export const he = (text: string): Line => ({ lang: 'he', text });
export const en = (text: string): Line => ({ lang: 'en', text });

// מונה רצפים: כשמתחיל רצף חדש (או עוצרים), רצף קודם שעוד באמצע מפסיק לדבר
let seq = 0;

// אומר כמה שורות ברצף - הוראה בעברית ואז המילה/המשפט באנגלית, כל אחת בקול של השפה שלה
export async function speakLines(lines: Line[]) {
  const mine = ++seq;
  for (const l of lines) {
    if (mine !== seq) return;
    await speak(l.text, { lang: l.lang });
  }
}

export function stopSpeaking() {
  seq++;
  if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
}

export function hasHebrewVoice() {
  return Boolean(heVoice);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function getRecognitionCtor(): any {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function canListen() {
  return Boolean(getRecognitionCtor());
}

// מקשיב פעם אחת ומחזיר את כל החלופות שהדפדפן זיהה (באותיות קטנות). מערך ריק = לא נשמע כלום.
export function listenOnce(timeoutMs = 6000): Promise<string[]> {
  return new Promise((resolve) => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return resolve([]);
    stopSpeaking();
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    rec.continuous = false;
    let done = false;
    const finish = (r: string[]) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { rec.abort(); } catch {}
      resolve(r);
    };
    const timer = setTimeout(() => finish([]), timeoutMs);
    rec.onresult = (e: any) => {
      const out: string[] = [];
      for (let i = 0; i < e.results.length; i++) {
        for (let j = 0; j < e.results[i].length; j++) out.push(String(e.results[i][j].transcript).toLowerCase().trim());
      }
      finish(out);
    };
    rec.onerror = () => finish([]);
    rec.onend = () => finish([]);
    try { rec.start(); } catch { finish([]); }
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function editDistance(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

const NUMBER_ALIASES: Record<string, string[]> = {
  one: ['1', 'won'],
  two: ['2', 'to', 'too'],
  three: ['3', 'tree', 'free'],
  four: ['4', 'for'],
  five: ['5'],
};
// מילים קצרות שזיהוי הדיבור מפספס הרבה - לא חובה לשמוע אותן
const FILLER = new Set(['a', 'an', 'the', 'some', 'i']);

const singular = (w: string) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);

function tokenHeard(words: string[], token: string) {
  const options = [token, ...(NUMBER_ALIASES[token] ?? [])];
  const tolerance = token.length >= 5 ? 1 : 0;
  return words.some((w) => options.includes(w) || singular(w) === singular(token) || (tolerance && editDistance(w, token) <= tolerance));
}

// בדיקה סלחנית: ילדה בת 7 עם מבטא ישראלי. במילה אחת - מספיק שהיא מופיעה באחת החלופות (או קרובה
// מספיק במילים ארוכות). בצירוף ("two red hearts") - כל אחת מהמילים החשובות צריכה להישמע, בלי חשיבות
// ליחיד/רבים או לסדר
export function heardWord(transcripts: string[], target: string, accept: string[] = []) {
  const targets = [target, ...accept].map((t) => t.toLowerCase());
  for (const t of transcripts) {
    const clean = t.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const words = clean.split(' ');
    for (const target of targets) {
      if (` ${clean} `.includes(` ${target} `)) return true;
      if (clean.replace(/ /g, '') === target.replace(/ /g, '')) return true;
      const tokens = target.split(' ').filter((w) => !FILLER.has(w));
      if (tokens.length && tokens.every((tok) => tokenHeard(words, tok))) return true;
    }
  }
  return false;
}
